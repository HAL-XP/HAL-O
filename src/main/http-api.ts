// ── HTTP Control API + WebSocket + PWA ──
// Lightweight server for external control, mobile PWA, and real-time comms.
// Binds to 0.0.0.0:19400 (accessible via Tailscale or LAN).

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { terminalManager } from './terminal-manager'
import { dispatchMessage, getActiveTerminals, setStickySession, getVoiceForProject, getAliasForProject } from './dispatcher'
import { getOrCreateAgent, sendMessage as agentSendMessage, listAgents, getHistory, clearHistory } from './agent-api'
import { injectAndCapture, findHalSession, processPtyOutput } from './response-capture'
import { loadTree, getAllNodes, getNode, createNode, updateNode, deleteNode, moveNode, syncAliasesFromTree, migrateFromAliases, findNodeByAlias, type NodeType } from './halo-tree'
import { spawn } from 'child_process'
import { join } from 'path'
import { tmpdir } from 'os'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { getPort, dataPath, getInstanceName } from './instance'

// WebSocket — Electron bundles ws
let WebSocketServer: any
try { WebSocketServer = require('ws').WebSocketServer } catch { /* no ws */ }

const PORT = getPort()

/** Strip markdown formatting for clean mobile display */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')           // code blocks
    .replace(/`([^`]+)`/g, '$1')               // inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1')         // bold
    .replace(/\*([^*]+)\*/g, '$1')              // italic
    .replace(/^#{1,6}\s+/gm, '')               // headers
    .replace(/^\s*[-*]\s+/gm, '- ')            // normalize bullets
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')   // links → text only
    .replace(/>\s+/g, '')                       // blockquotes
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
const WS_CLIENTS = new Set<any>()

// ── TTS helper ──
const scriptsDir = join(process.env.USERPROFILE || process.env.HOME || '', '.claude', 'scripts')
const ttsScript = join(scriptsDir, 'tts.py')
const transcribeScript = join(scriptsDir, 'transcribe.py')
const pythonExe = 'python'

function generateTTS(text: string, profile: string = 'auto', lang: string = 'en'): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const outPath = join(tmpdir(), `pwa_tts_${Date.now()}.ogg`)
    const proc = spawn(pythonExe, [ttsScript, text, outPath, profile, lang], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`TTS failed: ${stdout}`))
      // tts.py outputs file paths (may be multiple chunks)
      const files = stdout.split('\n').map(l => l.trim()).filter(l => l.endsWith('.ogg') && existsSync(l))
      if (files.length === 0) {
        // Try the base path + numbered variants
        const paths: string[] = []
        if (existsSync(outPath)) paths.push(outPath)
        for (let i = 2; i <= 10; i++) {
          const chunk = outPath.replace('.ogg', `_${i}.ogg`)
          if (existsSync(chunk)) paths.push(chunk)
          else break
        }
        resolve(paths.length > 0 ? paths : [outPath])
      } else {
        resolve(files)
      }
    })
  })
}

function transcribeAudio(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonExe, [transcribeScript, filePath], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let text = ''
    proc.stdout.on('data', (d: Buffer) => { text += d.toString() })
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error('Transcription failed'))
      resolve(text.trim())
    })
  })
}

// ── Broadcast to all WebSocket clients ──
function wsBroadcast(type: string, data: unknown) {
  const msg = JSON.stringify({ type, ...data as Record<string, unknown> })
  for (const ws of WS_CLIENTS) {
    try { if (ws.readyState === 1) ws.send(msg) } catch { /* ignore */ }
  }
}

// ── HTTP helpers ──
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk.toString() })
    req.on('end', () => resolve(data))
  })
}

function readBodyRaw(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(body))
}

function html(res: ServerResponse, content: string) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
  res.end(content)
}

// ── Request handler ──
async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || '/'
  const method = req.method || 'GET'

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  try {
    // ── GET / or GET /pwa — serve the PWA ──
    if ((url === '/' || url === '/pwa') && method === 'GET') {
      return html(res, getPwaHtml())
    }

    // ── GET /manifest.json — PWA manifest for home screen install ──
    if (url === '/manifest.json' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify({
        name: 'Halo Chat',
        short_name: 'Halo',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0e17',
        theme_color: '#00e5ff',
        icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
      }))
      return
    }

    // ── GET /report/* — serve HTML reports ──
    if (url?.startsWith('/report/') && method === 'GET') {
      const name = url.slice(8).replace(/[^a-zA-Z0-9_-]/g, '')
      const reportPath = join(process.cwd(), '_reports', name + '.html')
      if (existsSync(reportPath)) {
        return html(res, readFileSync(reportPath, 'utf-8'))
      }
      return json(res, 404, { error: 'Report not found' })
    }

    // ── GET /sw.js — service worker ──
    if (url === '/sw.js' && method === 'GET') {
      const swPath = [
        join(process.cwd(), 'src', 'main', 'pwa', 'sw.js'),
        join(__dirname, 'pwa', 'sw.js'),
      ].find(p => existsSync(p))
      if (swPath) {
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Service-Worker-Allowed': '/' })
        res.end(readFileSync(swPath, 'utf-8'))
        return
      }
    }

    // ── GET /icon.png — app icon ──
    if (url === '/icon.png' && method === 'GET') {
      // Try multiple paths (dev vs built)
      const iconPath = [
        join(process.cwd(), 'resources', 'icon.png'),
        join(__dirname, '..', '..', 'resources', 'icon.png'),
        join(__dirname, '..', '..', '..', 'resources', 'icon.png'),
      ].find(p => existsSync(p)) || ''
      if (existsSync(iconPath)) {
        const data = readFileSync(iconPath)
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': data.length })
        res.end(data)
      } else {
        res.writeHead(404)
        res.end()
      }
      return
    }

    // ── POST /voice/transcribe — upload audio, get transcript ──
    if (url === '/voice/transcribe' && method === 'POST') {
      const raw = await readBodyRaw(req)
      const ts = Date.now()
      const webmPath = join(tmpdir(), `pwa_audio_${ts}.webm`)
      const oggPath = join(tmpdir(), `pwa_audio_${ts}.ogg`)
      writeFileSync(webmPath, raw)
      // Convert webm → ogg via ffmpeg (faster-whisper needs ogg/wav)
      try {
        await new Promise<void>((resolve, reject) => {
          const ff = spawn('ffmpeg', ['-y', '-i', webmPath, '-ac', '1', '-ar', '16000', oggPath], { stdio: 'ignore' })
          ff.on('close', (code) => code === 0 ? resolve() : reject(new Error('ffmpeg failed')))
          ff.on('error', reject)
        })
      } catch {
        // If ffmpeg fails, try transcribing webm directly
        const transcript = await transcribeAudio(webmPath)
        return json(res, 200, { transcript })
      }
      const transcript = await transcribeAudio(oggPath)
      return json(res, 200, { transcript })
    }

    // ── POST /voice/tts — generate TTS, return audio URLs ──
    // Body: { text: string, profile?: string, lang?: string }
    if (url === '/voice/tts' && method === 'POST') {
      const body = JSON.parse(await readBody(req))
      const { text, profile = 'auto', lang = 'en' } = body
      if (!text) return json(res, 400, { error: 'text required' })
      const files = await generateTTS(text, profile, lang)
      // Return file IDs that can be fetched via /voice/audio/:id
      const audioIds = files.map((f, i) => {
        const id = `tts_${Date.now()}_${i}`
        _audioCache.set(id, f)
        return id
      })
      return json(res, 200, { audioIds })
    }

    // ── GET /voice/audio?id=xxx — serve a TTS audio file ──
    if (url?.startsWith('/voice/audio') && method === 'GET') {
      const id = new URL(url, 'http://localhost').searchParams.get('id')
      if (!id) return json(res, 400, { error: 'id required' })
      const filePath = _audioCache.get(id)
      if (!filePath || !existsSync(filePath)) return json(res, 404, { error: 'audio not found' })
      const data = readFileSync(filePath)
      res.writeHead(200, {
        'Content-Type': 'audio/ogg',
        'Content-Length': data.length,
        'Access-Control-Allow-Origin': '*',
      })
      res.end(data)
      return
    }

    // ── GET /tree — full tree ──
    if (url === '/tree' && method === 'GET') {
      return json(res, 200, loadTree())
    }

    // ── GET /tree/nodes — all nodes flat ──
    if (url === '/tree/nodes' && method === 'GET') {
      return json(res, 200, { nodes: getAllNodes() })
    }

    // ── GET /tree/node?id=xxx ──
    if (url?.startsWith('/tree/node') && method === 'GET') {
      const id = new URL(url, 'http://localhost').searchParams.get('id')
      if (!id) return json(res, 400, { error: 'id required' })
      const node = getNode(id)
      return node ? json(res, 200, node) : json(res, 404, { error: 'Node not found' })
    }

    // ── POST /tree/create — create node ──
    if (url === '/tree/create' && method === 'POST') {
      const body = JSON.parse(await readBody(req))
      const { type, name, parentId, options } = body
      if (!type || !name || !parentId) return json(res, 400, { error: 'type, name, parentId required' })
      try {
        const node = createNode(type as NodeType, name, parentId, options)
        syncAliasesFromTree()
        return json(res, 200, node)
      } catch (err) { return json(res, 400, { error: String(err) }) }
    }

    // ── POST /tree/update — update node ──
    if (url === '/tree/update' && method === 'POST') {
      const body = JSON.parse(await readBody(req))
      const { id, ...updates } = body
      if (!id) return json(res, 400, { error: 'id required' })
      const node = updateNode(id, updates)
      syncAliasesFromTree()
      return node ? json(res, 200, node) : json(res, 404, { error: 'Node not found' })
    }

    // ── POST /tree/delete ──
    if (url === '/tree/delete' && method === 'POST') {
      const body = JSON.parse(await readBody(req))
      const ok = deleteNode(body.id)
      syncAliasesFromTree()
      return json(res, 200, { deleted: ok })
    }

    // ── POST /tree/move ──
    if (url === '/tree/move' && method === 'POST') {
      const body = JSON.parse(await readBody(req))
      const ok = moveNode(body.id, body.newParentId)
      syncAliasesFromTree()
      return json(res, 200, { moved: ok })
    }

    // ── POST /chat/session — route through HAL terminal (same session everywhere) ──
    // Falls back to API if terminal not running
    if (url === '/chat/session' && method === 'POST') {
      const body = JSON.parse(await readBody(req))
      const { message, agent = 'hal' } = body
      if (!message) return json(res, 400, { error: 'message required' })

      const halSession = findHalSession()

      if (!halSession) {
        console.log('[HTTP-API] No HAL terminal running — returning fallback')
        wsBroadcast('session_fallback', { agent, reason: 'HAL terminal not running. Using standalone AI (no shared memory).' })
        return json(res, 200, { sessionMode: false, fallback: true, reason: 'No HAL terminal' })
      }

      if (halSession) {
        const msgId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

        // Load aliases for voice/lang lookup
        let sessAliases: Array<{name: string; voice?: string}> = []
        try {
          const raw = JSON.parse(readFileSync(dataPath('aliases.json'), 'utf-8'))
          for (const [alias, entry] of Object.entries(raw)) {
            const e = typeof entry === 'string' ? { project: entry } : entry as any
            sessAliases.push({ name: alias, voice: e.voice })
          }
        } catch {}
        const aliasEntry = sessAliases.find(a => a.name === agent)
        const voice = aliasEntry?.voice || 'butler'
        const lang = agent === 'karen' ? 'fr' : 'en'

        // Inject into terminal and capture response
        const success = injectAndCapture(
          halSession,
          msgId,
          agent,
          message,
          // onChunk — stream to PWA
          (text) => {
            wsBroadcast('session_chunk', { agent, chunk: text, done: false, msgId })
          },
          // onDone — response complete
          (fullText) => {
            wsBroadcast('session_chunk', { agent, chunk: '', done: true, fullText, msgId })
            // Generate TTS
            if (fullText.length > 5) {
              generateTTS(fullText, voice, lang).then((files) => {
                const audioIds = files.map((f, i) => {
                  const id = `tts_${Date.now()}_${i}`
                  _audioCache.set(id, f)
                  return id
                })
                wsBroadcast('tts_ready', { agent, audioIds, msgId })
              }).catch(() => {})
            }
          }
        )

        if (success) {
          return json(res, 200, { status: 'injected', msgId, agent, sessionMode: true })
        } else {
          return json(res, 500, { error: 'Failed to inject message' })
        }
      }

      // If we get here, no terminal — fall through to API handler below
    }

    // ── POST /chat — send message to agent via Anthropic API (streaming) ──
    // Body: { message: string, agent?: string }
    if (url === '/chat' && method === 'POST') {
      const body = JSON.parse(await readBody(req))
      const { message, agent, images, model } = body
      if (!message) return json(res, 400, { error: 'message required' })

      // Resolve agent: check aliases.json directly (no terminal dependency)
      let targetAlias = agent
      let targetProject = ''
      let targetPath = ''
      let targetVoice: string | null = null

      // Load aliases config
      let aliasesConfig: Record<string, any> = {}
      try {
        aliasesConfig = JSON.parse(readFileSync(dataPath('aliases.json'), 'utf-8'))
      } catch { /* no aliases */ }

      // Normalize aliases
      const aliasEntries: Array<{alias: string; project: string; voice: string | null}> = []
      for (const [alias, entry] of Object.entries(aliasesConfig)) {
        const e = typeof entry === 'string' ? { project: entry } : entry as { project: string; voice?: string }
        aliasEntries.push({ alias, project: e.project, voice: e.voice || null })
      }

      // If agent specified, find it
      if (targetAlias) {
        const found = aliasEntries.find(a => a.alias === targetAlias || a.project === targetAlias)
        if (found) {
          targetAlias = found.alias
          targetProject = found.project
          targetVoice = found.voice
        }
      }

      // If no agent, scan message for alias mentions
      if (!targetAlias) {
        const msgLower = message.toLowerCase()
        const found = aliasEntries.find(a => msgLower.includes(a.alias.toLowerCase()))
        if (found) {
          targetAlias = found.alias
          targetProject = found.project
          targetVoice = found.voice
        }
      }

      // Still nothing? Use first alias as default
      if (!targetAlias && aliasEntries.length > 0) {
        const first = aliasEntries[0]
        targetAlias = first.alias
        targetProject = first.project
        targetVoice = first.voice
      }

      if (!targetAlias) return json(res, 400, { error: 'No agents configured in ~/.hal-o/aliases.json' })

      // Resolve project path
      if (!targetPath) {
        targetPath = join('D:/GitHub', targetProject)
        if (!existsSync(targetPath)) targetPath = join(process.env.USERPROFILE || '', 'GitHub', targetProject)
      }

      // Initialize agent + apply model override
      const initAgent = getOrCreateAgent(targetAlias, targetProject, targetPath, targetVoice)
      if (model) initAgent.config.model = model

      // Stream response
      let fullText = ''
      let sentenceBuffer = ''
      let ttsBuffer = ''
      let sentenceIndex = 0
      const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const agentState = getOrCreateAgent(targetAlias, targetProject, targetPath, targetVoice)
      const voice = agentState.config.voice || 'auto'
      const lang = agentState.config.lang || 'en'

      // Sentence-level TTS: serialize generation (GPU can only do one at a time)
      const ttsQueue: Array<{ sentence: string; idx: number }> = []
      let ttsProcessing = false

      async function processTtsQueue() {
        if (ttsProcessing || ttsQueue.length === 0) return
        ttsProcessing = true
        while (ttsQueue.length > 0) {
          const { sentence, idx } = ttsQueue.shift()!
          try {
            console.log(`[HTTP-API] TTS sentence ${idx} for ${targetAlias} [${msgId}]: ${sentence.slice(0, 40)}...`)
            const files = await generateTTS(sentence, voice, lang)
            console.log(`[HTTP-API] TTS done sentence ${idx}: ${files.length} files`)
            const audioIds = files.map((f, i) => {
              const id = `tts_${Date.now()}_s${idx}_${i}`
              _audioCache.set(id, f)
              return id
            })
            wsBroadcast('tts_ready', { agent: targetAlias, audioIds, msgId, sentenceIndex: idx })
          } catch (err) { console.error('[HTTP-API] TTS sentence error:', err) }
        }
        ttsProcessing = false
      }

      function tryFlushSentence() {
        const match = ttsBuffer.match(/^(.*?[.!?])\s+(.*)$/s)
        if (match) {
          const sentence = stripMarkdown(match[1].trim())
          ttsBuffer = match[2]
          if (sentence.length > 3) {
            ttsQueue.push({ sentence, idx: sentenceIndex++ })
            processTtsQueue() // start processing (serialized)
          }
        }
      }

      try {
        fullText = await agentSendMessage(targetAlias, message, (chunk, done) => {
          if (chunk) {
            sentenceBuffer += chunk
            ttsBuffer += chunk
            wsBroadcast('chat_chunk', { agent: targetAlias, chunk, done: false, msgId })
            // Check for sentence boundary
            tryFlushSentence()
          }
          if (done) {
            const accumulated = sentenceBuffer
            const clean = stripMarkdown(accumulated)
            wsBroadcast('chat_chunk', { agent: targetAlias, chunk: '', done: true, fullText: clean, msgId })
            // Flush remaining text as final TTS chunk (via queue)
            const remaining = stripMarkdown(ttsBuffer.trim())
            if (remaining.length > 3) {
              ttsQueue.push({ sentence: remaining, idx: sentenceIndex++ })
              processTtsQueue()
            }
          }
        }, images)

        return json(res, 200, {
          agent: targetAlias,
          response: stripMarkdown(fullText),
          voice: targetVoice,
          lang: getOrCreateAgent(targetAlias, targetProject, targetPath, targetVoice).config.lang,
        })
      } catch (err) {
        return json(res, 500, { error: String(err) })
      }
    }

    // ── GET /chat/history?agent=xxx ──
    if (url?.startsWith('/chat/history') && method === 'GET') {
      const agentName = new URL(url, 'http://localhost').searchParams.get('agent')
      if (!agentName) return json(res, 400, { error: 'agent param required' })
      return json(res, 200, { agent: agentName, history: getHistory(agentName) })
    }

    // ── POST /chat/clear — clear agent history ──
    if (url === '/chat/clear' && method === 'POST') {
      const body = JSON.parse(await readBody(req))
      clearHistory(body.agent)
      return json(res, 200, { status: 'cleared' })
    }

    // ── GET /agents — list API-backed agents ──
    if (url === '/agents' && method === 'GET') {
      return json(res, 200, { agents: listAgents() })
    }

    // ── GET /chat/aliases — list configured aliases for PWA agent chips ──
    if (url === '/chat/aliases' && method === 'GET') {
      let aliases: Array<{name: string; project: string; voice: string | null}> = []
      try {
        const raw = JSON.parse(readFileSync(dataPath('aliases.json'), 'utf-8'))
        for (const [alias, entry] of Object.entries(raw)) {
          const e = typeof entry === 'string' ? { project: entry } : entry as { project: string; voice?: string }
          aliases.push({ name: alias, project: e.project, voice: e.voice || null })
        }
      } catch { /* no aliases */ }
      return json(res, 200, { aliases })
    }

    // ── POST /message — send a message (text or voice), dispatch + get TTS reply ──
    // Body: { message: string, voice?: boolean, profile?: string }
    if (url === '/message' && method === 'POST') {
      const body = JSON.parse(await readBody(req))
      const { message, profile } = body
      if (!message) return json(res, 400, { error: 'message required' })

      // Dispatch to the right terminal
      const result = dispatchMessage(message)
      if (!result.sessionId) {
        return json(res, 200, { dispatched: false, reason: 'no matching terminal' })
      }

      // Determine voice profile from alias
      const voiceProfile = profile || (result.projectName ? getVoiceForProject(result.projectName) : null) || 'auto'

      // Send to terminal
      const tag = result.projectName && result.confidence > 0.5
        ? `[voice → ${result.projectName}]`
        : '[voice]'
      terminalManager.write(result.sessionId, `${tag} ${result.cleanMessage || message}\r`)

      // Notify WebSocket clients
      wsBroadcast('dispatched', {
        message,
        sessionId: result.sessionId,
        projectName: result.projectName,
        alias: result.projectName ? getAliasForProject(result.projectName) : null,
        voiceProfile,
        layer: result.layer,
        confidence: result.confidence,
      })

      return json(res, 200, {
        dispatched: true,
        sessionId: result.sessionId,
        projectName: result.projectName,
        alias: result.projectName ? getAliasForProject(result.projectName) : null,
        voiceProfile,
        layer: result.layer,
      })
    }

    // ── GET /terminals — list active terminals ──
    if (url === '/terminals' && method === 'GET') {
      const sessions = terminalManager.getActiveSessions()
      const enriched = sessions.map(s => ({
        ...s,
        alias: getAliasForProject(s.projectName),
        voice: getVoiceForProject(s.projectName),
      }))
      return json(res, 200, { terminals: enriched })
    }

    // ── POST /terminal/open — spawn a new terminal ──
    if (url === '/terminal/open' && method === 'POST') {
      const body = JSON.parse(await readBody(req))
      const { path, name, cmd, args } = body
      if (!path) return json(res, 400, { error: 'path is required' })
      const projectName = name || path.split(/[/\\]/).filter(Boolean).pop() || 'unknown'
      const sessionId = `api-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const command = cmd || 'claude'
      // Smart resume: use --continue if project has a prior Claude conversation
      let defaultArgs = ['--dangerously-skip-permissions', '-n', projectName]
      if (!args) {
        const projDirName = path.replace(/\\/g, '/').replace(/\/$/, '').split('/').join('-').replace(/^-/, '').replace(/:/g, '')
        const claudeProjectDir = join(process.env.USERPROFILE || process.env.HOME || '', '.claude', 'projects', projDirName)
        if (existsSync(claudeProjectDir)) {
          defaultArgs.push('--continue')
        }
      }
      const commandArgs = args || defaultArgs
      const ok = terminalManager.spawn(sessionId, {
        cwd: path, cmd: command, args: commandArgs, cols: 120, rows: 30, projectName,
      })
      return json(res, ok ? 200 : 500, ok
        ? { sessionId, projectName, status: 'spawned' }
        : { error: 'Failed to spawn terminal' })
    }

    // ── POST /terminal/input ──
    if (url === '/terminal/input' && method === 'POST') {
      const body = JSON.parse(await readBody(req))
      const { sessionId, text } = body
      if (!sessionId || !text) return json(res, 400, { error: 'sessionId and text required' })
      if (!terminalManager.isRunning(sessionId)) return json(res, 404, { error: 'session not found' })
      terminalManager.write(sessionId, text)
      return json(res, 200, { status: 'sent' })
    }

    // ── POST /terminal/close ──
    if (url === '/terminal/close' && method === 'POST') {
      const body = JSON.parse(await readBody(req))
      terminalManager.close(body.sessionId)
      return json(res, 200, { status: 'closed' })
    }

    // ── GET /terminal/scrollback?id=xxx ──
    if (url?.startsWith('/terminal/scrollback') && method === 'GET') {
      const id = new URL(url, 'http://localhost').searchParams.get('id')
      if (!id) return json(res, 400, { error: 'id required' })
      return json(res, 200, { sessionId: id, scrollback: terminalManager.getScrollback(id) })
    }

    // ── POST /dispatch ──
    if (url === '/dispatch' && method === 'POST') {
      const body = JSON.parse(await readBody(req))
      return json(res, 200, dispatchMessage(body.message))
    }

    // ── POST /dispatch/send ──
    if (url === '/dispatch/send' && method === 'POST') {
      const body = JSON.parse(await readBody(req))
      const { message, prefix = '[voice]' } = body
      if (!message) return json(res, 400, { error: 'message required' })
      const result = dispatchMessage(message)
      if (result.sessionId) {
        const tag = result.projectName && result.confidence > 0.5
          ? `[voice → ${result.projectName}]` : prefix
        terminalManager.write(result.sessionId, `${tag} ${result.cleanMessage || message}\r`)
        return json(res, 200, { ...result, sent: true })
      }
      return json(res, 200, { ...result, sent: false })
    }

    // ── GET /projects ──
    if (url === '/projects' && method === 'GET') {
      const terminals = getActiveTerminals()
      return json(res, 200, {
        projects: terminals.map(t => ({
          name: t.projectName, path: t.projectPath, sessionId: t.sessionId,
          alias: getAliasForProject(t.projectName),
        })),
      })
    }

    // ── POST /sticky ──
    if (url === '/sticky' && method === 'POST') {
      const body = JSON.parse(await readBody(req))
      setStickySession(body.sessionId ?? null)
      return json(res, 200, { status: 'ok' })
    }

    // ── GET /screenshot — trigger app screenshot ──
    if (url === '/screenshot' && method === 'GET') {
      try {
        const { ipcMain } = await import('electron')
        // Trigger via IPC (mainWindow captures page)
        const screenshotPath = join(process.cwd(), '_screenshot_app.png')
        // Use the BrowserWindow directly
        const { BrowserWindow } = await import('electron')
        const win = BrowserWindow.getAllWindows()[0]
        if (win) {
          const image = await win.webContents.capturePage()
          writeFileSync(screenshotPath, image.toPNG())
          const data = readFileSync(screenshotPath)
          res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': data.length })
          res.end(data)
          return
        }
        return json(res, 500, { error: 'No window found' })
      } catch (err) { return json(res, 500, { error: String(err) }) }
    }

    // ── GET /health ──
    if (url === '/health' && method === 'GET') {
      return json(res, 200, {
        status: 'ok',
        instance: getInstanceName(),
        terminals: terminalManager.getActiveSessions().length,
        uptime: process.uptime(),
        wsClients: WS_CLIENTS.size,
      })
    }

    json(res, 404, { error: `Not found: ${method} ${url}` })
  } catch (err) {
    json(res, 500, { error: String(err) })
  }
}

// ── Audio file cache (TTS outputs) ──
const _audioCache = new Map<string, string>()
// Clean old entries every 5 min
setInterval(() => {
  if (_audioCache.size > 100) {
    const keys = Array.from(_audioCache.keys())
    for (let i = 0; i < keys.length - 50; i++) _audioCache.delete(keys[i])
  }
}, 300000)

// ── PWA HTML — loaded from external file ──
let _pwaHtmlCache: string | null = null
function getPwaHtml(): string {
  // Cache in dev, reload each time (file may change)
  const pwaPath = [
    join(process.cwd(), 'src', 'main', 'pwa', 'halo-chat.html'),
    join(__dirname, 'pwa', 'halo-chat.html'),
    join(__dirname, '..', 'main', 'pwa', 'halo-chat.html'),
  ].find(p => existsSync(p))
  if (pwaPath) return readFileSync(pwaPath, 'utf-8')
  // Fallback to inline if file not found
  return _getPwaHtmlFallback()
}
function _getPwaHtmlFallback(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#0a0e17">
<title>Halo Chat</title>
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/icon.png">
<link rel="apple-touch-icon" href="/icon.png">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
:root { --bg: #0a0e17; --surface: #111827; --border: #1e2a3a; --cyan: #00e5ff; --red: #ff3d3d; --green: #00ff88; --text: #e0e6ed; --muted: #6b7a8d; --accent: #00e5ff; }
body { background: var(--bg); color: var(--text); font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 14px; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
html { height: 100%; overflow: hidden; }
.scene-header { position: relative; height: 30vh; min-height: 160px; max-height: 250px; background: var(--bg); border-bottom: 1px solid var(--border); flex-shrink: 0; overflow: hidden; }
.scene-header canvas { width: 100% !important; height: 100% !important; display: block; }
.scene-overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 8px 16px; display: flex; align-items: center; background: linear-gradient(transparent, rgba(10,14,23,0.9)); }
.scene-overlay .logo { color: var(--cyan); font-weight: bold; font-size: 18px; letter-spacing: 2px; }
.scene-overlay .status { font-size: 11px; color: var(--muted); margin-left: auto; }
.scene-overlay .status.online { color: var(--green); }
.agents { display: flex; gap: 8px; padding: 10px 16px; overflow-x: auto; flex-shrink: 0; }
.agent-chip { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 6px 14px; font-size: 12px; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
.agent-chip:hover, .agent-chip.active { border-color: var(--cyan); color: var(--cyan); background: rgba(0,229,255,0.08); }
.agent-chip .alias { font-weight: bold; text-transform: uppercase; }
.messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.msg { max-width: 85%; padding: 10px 14px; border-radius: 12px; font-size: 13px; line-height: 1.5; word-wrap: break-word; }
.msg.user { align-self: flex-end; background: rgba(0,229,255,0.15); border: 1px solid rgba(0,229,255,0.3); }
.msg.agent { align-self: flex-start; background: var(--surface); border: 1px solid var(--border); }
.msg .meta { font-size: 10px; color: var(--muted); margin-top: 4px; }
.msg .target { color: var(--cyan); font-weight: bold; }
.msg audio { width: 100%; margin-top: 6px; height: 32px; }
.input-area { background: var(--surface); border-top: 1px solid var(--border); padding: 12px 16px; padding-bottom: max(12px, env(safe-area-inset-bottom)); display: flex; gap: 8px; align-items: flex-end; flex-shrink: 0; }
.input-area textarea { flex: 1; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-family: inherit; font-size: 14px; padding: 10px 12px; resize: none; min-height: 42px; max-height: 120px; outline: none; }
.input-area textarea:focus { border-color: var(--cyan); }
.btn { width: 42px; height: 42px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; }
.btn-send { background: var(--cyan); color: var(--bg); }
.btn-send:hover { filter: brightness(1.2); }
.btn-send:disabled { opacity: 0.3; cursor: not-allowed; }
.btn-mic { background: transparent; border: 2px solid var(--border); color: var(--muted); }
.btn-mic:hover { border-color: var(--cyan); color: var(--cyan); }
.btn-mic.recording { border-color: var(--red); color: var(--red); animation: pulse 1s infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
.toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: var(--surface); border: 1px solid var(--cyan); border-radius: 8px; padding: 8px 16px; font-size: 12px; color: var(--cyan); z-index: 100; animation: fadeInOut 3s forwards; }
@keyframes fadeInOut { 0% { opacity: 0; transform: translateX(-50%) translateY(-10px); } 10% { opacity: 1; transform: translateX(-50%) translateY(0); } 80% { opacity: 1; } 100% { opacity: 0; } }
.typing { color: var(--muted); font-size: 12px; padding: 4px 16px; font-style: italic; min-height: 20px; }
</style>
</head>
<body>
<div class="scene-header" id="sceneHeader">
  <canvas id="sphereCanvas"></canvas>
  <div class="scene-overlay">
    <span class="logo">HALO CHAT</span>
    <span class="status" id="status">connecting...</span>
  </div>
</div>
<div class="agents" id="agents"></div>
<div class="messages" id="messages"></div>
<div class="typing" id="typing"></div>
<div class="input-area">
  <textarea id="input" rows="1" placeholder="Type a message..."></textarea>
  <button class="btn btn-send" id="sendBtn" title="Send">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
  </button>
  <button class="btn btn-mic" id="micBtn" title="Hold to record">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
  </button>
</div>

<script>
const API = location.origin;
const WS_URL = location.origin.replace(/^http/, 'ws') + '/ws';

let ws = null;
let activeAgent = null;
let activeTab = 'all'; // 'all' or agent name
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// ── Elements ──
const statusEl = document.getElementById('status');
const agentsEl = document.getElementById('agents');
const messagesEl = document.getElementById('messages');
const typingEl = document.getElementById('typing');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');

// ── WebSocket ──
function connectWs() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    statusEl.textContent = 'connected';
    statusEl.className = 'status online';
    loadAgents();
  };
  ws.onclose = () => {
    statusEl.textContent = 'disconnected';
    statusEl.className = 'status';
    setTimeout(connectWs, 3000);
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'chat_chunk') {
      // Streaming response from agent API
      if (!msg.done && msg.chunk) {
        // Append to current streaming message
        if (!window._streamingDiv || window._streamingAgent !== msg.agent) {
          window._streamingDiv = addMessage('agent', '', msg.agent);
          window._streamingAgent = msg.agent;
          window._streamingText = '';
        }
        window._streamingText += msg.chunk;
        window._streamingDiv.innerHTML = window._streamingText.replace(/\\n/g, '<br>') +
          '<div class="meta">\\u2192 <span class="target">' + msg.agent + '</span></div>';
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
      if (msg.done) {
        window._streamingDiv = null;
        window._streamingAgent = null;
        saveHistory();
      }
    } else if (msg.type === 'tts_ready') {
      // Auto-play agent's voice response
      const name = msg.agent || 'agent';
      addMessage('agent', '🔊 Voice response', name);
      playAudioSequence(msg.audioIds);
    }
  };
  ws.onerror = () => {};
}

// ── Load agents ──
const AGENT_COLORS = { hal: '#00e5ff', bob: '#4ade80', karen: '#f472b6', all: '#00e5ff' };

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.agent-chip').forEach(c => c.classList.remove('active'));
  document.querySelector('.agent-chip[data-tab="' + tab + '"]')?.classList.add('active');
  // Show/hide messages based on tab
  document.querySelectorAll('#messages .msg').forEach(el => {
    const msgAgent = el.getAttribute('data-agent') || '';
    el.style.display = (tab === 'all' || msgAgent === tab || msgAgent === '') ? '' : 'none';
  });
  // Set active agent for sending (all = first agent)
  if (tab !== 'all') activeAgent = tab;
  // Update accent color
  const color = AGENT_COLORS[tab] || AGENT_COLORS.all;
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--cyan', color);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function loadAgents() {
  try {
    let agents = [];
    try {
      const r = await fetch(API + '/chat/aliases');
      const d = await r.json();
      agents = d.aliases || [];
    } catch {}
    // Only rebuild if agent count changed
    const prevCount = agentsEl.children.length;
    if (prevCount === agents.length + 1) return; // +1 for ALL chip
    agentsEl.innerHTML = '';
    // ALL chip
    const allChip = document.createElement('div');
    allChip.className = 'agent-chip' + (activeTab === 'all' ? ' active' : '');
    allChip.setAttribute('data-tab', 'all');
    allChip.innerHTML = '<span class="alias">ALL</span>';
    allChip.onclick = () => switchTab('all');
    agentsEl.appendChild(allChip);
    // Agent chips
    agents.forEach((t, i) => {
      const name = t.name || 'agent';
      if (!activeAgent && i === 0) activeAgent = name;
      const chip = document.createElement('div');
      chip.className = 'agent-chip' + (activeTab === name ? ' active' : '');
      chip.setAttribute('data-tab', name);
      chip.innerHTML = '<span class="alias">' + name.toUpperCase() + '</span>';
      chip.onclick = () => switchTab(name);
      agentsEl.appendChild(chip);
    });
  } catch {}
}

// ── Message history (localStorage) ──
const MSG_KEY = 'halo_pwa_messages';
const MAX_HISTORY = 100;

function saveHistory() {
  try {
    const msgs = Array.from(messagesEl.children).slice(-MAX_HISTORY).map(el => ({
      cls: el.className,
      html: el.innerHTML,
      agent: el.getAttribute('data-agent') || '',
    }));
    localStorage.setItem(MSG_KEY, JSON.stringify(msgs));
  } catch {}
}

function loadHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(MSG_KEY) || '[]');
    stored.forEach(m => {
      const div = document.createElement('div');
      div.className = m.cls;
      div.innerHTML = m.html;
      if (m.agent) div.setAttribute('data-agent', m.agent);
      messagesEl.appendChild(div);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } catch {}
}

function addMessage(role, text, target) {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  if (target) div.setAttribute('data-agent', target);
  // Only show agent label on agent messages, not user messages
  const showLabel = role === 'agent' && target;
  div.innerHTML = text + (showLabel ? '<div class="meta">\\u2192 <span class="target">' + target + '</span></div>' : '');
  if (activeTab !== 'all' && target && target !== activeTab) div.style.display = 'none';
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  saveHistory();
  return div;
}

// ── Send message ──
async function sendMessage(text) {
  if (!text.trim()) return;
  addMessage('user', text, activeAgent);
  inputEl.value = '';
  inputEl.style.height = 'auto';

  try {
    typingEl.textContent = 'Thinking...';
    const activeAgentName = (activeTab !== 'all') ? activeTab : activeAgent;
    const res = await fetch(API + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, agent: activeAgentName }),
    });
    const data = await res.json();
    if (data.error) {
      addMessage('agent', 'Error: ' + data.error, null);
    }
    // Response already streamed via WebSocket — just clear typing
    typingEl.textContent = '';
  } catch (err) {
    typingEl.textContent = '';
    addMessage('agent', 'Error: ' + err.message, null);
  }
}

// ── Audio playback ──
async function playAudioSequence(audioIds) {
  for (const id of audioIds) {
    const url = API + '/voice/audio?id=' + id;
    await new Promise((resolve) => {
      const audio = new Audio(url);
      audio.onended = resolve;
      audio.onerror = resolve;
      audio.play().catch(resolve);
    });
  }
}

// ── Mic recording (tap to start, tap to stop) ──
let recordingTimer = null;
let recordingSeconds = 0;

async function toggleRecording() {
  if (isRecording) {
    // Stop
    if (mediaRecorder) mediaRecorder.stop();
    isRecording = false;
    micBtn.classList.remove('recording');
    if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
    typingEl.textContent = 'Processing...';
    return;
  }

  // Check HTTPS
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    typingEl.textContent = 'Mic requires HTTPS. Use https:// URL.';
    setTimeout(() => { typingEl.textContent = ''; }, 3000);
    return;
  }

  // Start
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Pick best supported mimeType
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
      : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      if (blob.size < 500) { typingEl.textContent = ''; return; }
      typingEl.textContent = 'Transcribing...';
      try {
        const res = await fetch(API + '/voice/transcribe', { method: 'POST', body: blob });
        const data = await res.json();
        if (data.transcript && data.transcript.trim()) {
          typingEl.textContent = '';
          sendMessage(data.transcript);
        } else {
          typingEl.textContent = 'Could not transcribe. Try again.';
          setTimeout(() => { typingEl.textContent = ''; }, 2000);
        }
      } catch (err) {
        typingEl.textContent = 'Transcription error: ' + err.message;
        setTimeout(() => { typingEl.textContent = ''; }, 3000);
      }
    };
    mediaRecorder.start(100); // collect data every 100ms
    isRecording = true;
    micBtn.classList.add('recording');
    recordingSeconds = 0;
    typingEl.textContent = 'Recording... 0s (tap mic to stop)';
    recordingTimer = setInterval(() => {
      recordingSeconds++;
      typingEl.textContent = 'Recording... ' + recordingSeconds + 's (tap mic to stop)';
      if (recordingSeconds >= 60) toggleRecording(); // 60s max
    }, 1000);
  } catch (err) {
    typingEl.textContent = 'Mic blocked: ' + (err.message || 'check permissions');
    setTimeout(() => { typingEl.textContent = ''; }, 3000);
  }
}

// ── Event handlers ──
sendBtn.onclick = () => sendMessage(inputEl.value);
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(inputEl.value); }
});
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
});

// Tap to toggle recording
micBtn.addEventListener('click', (e) => { e.preventDefault(); toggleRecording(); });

// ── 3D Sphere (lightweight, no Three.js dependency) ──
(function initSphere() {
  const canvas = document.getElementById('sphereCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, time = 0;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    w = canvas.width = rect.width * window.devicePixelRatio;
    h = canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }
  resize();
  window.addEventListener('resize', resize);

  function draw() {
    time += 0.01;
    const cw = w / window.devicePixelRatio;
    const ch = h / window.devicePixelRatio;
    ctx.clearRect(0, 0, cw, ch);

    const cx = cw / 2;
    const cy = ch / 2;
    const r = Math.min(cw, ch) * 0.3;

    // Glow
    const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.5);
    glow.addColorStop(0, 'rgba(0,229,255,0.15)');
    glow.addColorStop(0.5, 'rgba(0,229,255,0.05)');
    glow.addColorStop(1, 'rgba(0,229,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, cw, ch);

    // Wireframe sphere
    ctx.strokeStyle = 'rgba(0,229,255,0.4)';
    ctx.lineWidth = 0.5;
    // Latitude lines
    for (let i = -3; i <= 3; i++) {
      const lat = (i / 3) * Math.PI * 0.4;
      const ry = r * Math.cos(lat);
      const y = cy - r * Math.sin(lat) * 0.6;
      ctx.beginPath();
      ctx.ellipse(cx, y, ry, ry * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Longitude lines
    for (let i = 0; i < 8; i++) {
      const lon = (i / 8) * Math.PI + time;
      ctx.beginPath();
      for (let j = 0; j <= 32; j++) {
        const lat = (j / 32) * Math.PI * 2;
        const x = cx + r * Math.cos(lat) * Math.sin(lon);
        const y = cy - r * Math.sin(lat) * 0.6;
        j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Core dot
    ctx.beginPath();
    ctx.arc(cx, cy, 3 + Math.sin(time * 3) * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,229,255,0.9)';
    ctx.fill();

    // Pulse ring
    const pulseR = r * 0.5 + r * 0.5 * ((time * 0.5) % 1);
    const pulseAlpha = 1 - ((time * 0.5) % 1);
    ctx.beginPath();
    ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,229,255,' + (pulseAlpha * 0.3) + ')';
    ctx.lineWidth = 1;
    ctx.stroke();

    requestAnimationFrame(draw);
  }
  draw();
})();

// ── Init ──
// Clear old terminal-based messages on upgrade to API mode
const PWA_VERSION = '3';
if (localStorage.getItem('halo_pwa_version') !== PWA_VERSION) {
  localStorage.removeItem('halo_pwa_messages');
  localStorage.setItem('halo_pwa_version', PWA_VERSION);
}
loadHistory();
connectWs();
setInterval(loadAgents, 10000);
</script>
</body>
</html>`
}

// ── Start server ──
export function startHttpApi(): void {
  const server = createServer(handleRequest)

  // Register response capture subscriber (for Halo Chat session bridge)
  terminalManager.onExternalData((id, projectName, data) => {
    processPtyOutput(id, projectName, data)
  })

  // Stream terminal output to WebSocket clients
  // Buffer + debounce: collect output for 2000ms, then send as one message
  const outputBuffers = new Map<string, { text: string; timer: ReturnType<typeof setTimeout> | null; projectName: string }>()
  terminalManager.onExternalData((id, projectName, data) => {
    if (WS_CLIENTS.size === 0) return
    // Aggressive terminal output cleaning:
    // 0. Convert cursor-right movements to spaces BEFORE stripping (Claude CLI uses ESC[nC as word separators)
    let clean = data
      .replace(/\x1b\[(\d*)C/g, (_m, n) => ' '.repeat(parseInt(n) || 1))
    // 1. Strip ALL ANSI/xterm escape sequences
    clean = clean
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')    // CSI sequences
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC sequences
      .replace(/\x1b[()][AB012]/g, '')              // charset switches
      .replace(/\x1b[>=<]/g, '')                    // mode switches
      .replace(/\x1b\[[\?0-9;]*[hlm]/g, '')        // private modes
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '') // control chars (keep \n \r \t)
    // 2. Handle carriage returns (keep last content per line)
    clean = clean.split('\n').map(line => {
      const parts = line.split('\r')
      return parts[parts.length - 1]
    }).join('\n')
    // 3. Remove Claude UI artifacts: spinners, status bar, progress
    clean = clean
      .replace(/[✻✽✶✢·░▓█▒⏵]/g, '')              // spinner/progress chars
      .replace(/Hashing…/g, '')                     // loading indicators
      .replace(/Opus\s*4\.\d.*$/gm, '')             // status bar
      .replace(/ctx:.*$/gm, '')                     // context info
      .replace(/\$\d+\.\d+.*\|.*$/gm, '')          // cost/stats line
      .replace(/bypass\s*permissions?\s*on/gi, '')  // permission notice
      .replace(/shift\+tab\s*to\s*cycle/gi, '')     // UI hint
      .replace(/\(shift\+tab.*?\)/gi, '')           // UI hint
      .replace(/Git:master/g, '')                   // git status
      .replace(/\[work-assistant\]|\[personal-assistant\]/g, '') // project tags
    // 4. Remove progress bars, prompts, remaining UI
    clean = clean
      .replace(/░+.*?\|.*$/gm, '')                 // progress bars
      .replace(/[●❯❮▶◐◑◒◓⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g, '')   // prompt/spinner chars
      .replace(/\d+%\s*\|/g, '')                    // percentage indicators
      .replace(/\|\s*\$[\d.]+\s*\|/g, '')           // cost displays
    // 5. Clean up any remaining spacing issues
    clean = clean
      .replace(/,([A-Za-z])/g, ', $1')              // comma+letter
    // 6. Collapse whitespace
    clean = clean.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
    if (!clean || clean.length < 5) return

    let buf = outputBuffers.get(id)
    if (!buf) { buf = { text: '', timer: null, projectName }; outputBuffers.set(id, buf) }
    buf.text += clean

    if (buf.timer) clearTimeout(buf.timer)
    buf.timer = setTimeout(() => {
      const text = buf!.text.trim()
      buf!.text = ''
      buf!.timer = null
      if (text) {
        wsBroadcast('terminal_output', {
          sessionId: id,
          projectName,
          alias: getAliasForProject(projectName),
          text: text.slice(-2000), // cap at 2KB per broadcast
        })
      }
    }, 2000)
  })

  // WebSocket upgrade
  if (WebSocketServer) {
    const wss = new WebSocketServer({ noServer: true })
    server.on('upgrade', (req, socket, head) => {
      if (req.url === '/ws') {
        wss.handleUpgrade(req, socket, head, (ws: any) => {
          WS_CLIENTS.add(ws)
          console.log(`[HTTP-API] WebSocket client connected (${WS_CLIENTS.size} total)`)
          ws.on('close', () => WS_CLIENTS.delete(ws))
          ws.on('error', () => WS_CLIENTS.delete(ws))
          // Send current state
          const terminals = terminalManager.getActiveSessions().map(s => ({
            ...s,
            alias: getAliasForProject(s.projectName),
            voice: getVoiceForProject(s.projectName),
          }))
          ws.send(JSON.stringify({ type: 'init', terminals }))
        })
      } else {
        socket.destroy()
      }
    })
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[HTTP-API] Listening on http://0.0.0.0:${PORT}`)
    console.log(`[HTTP-API] PWA: http://localhost:${PORT}/`)
    if (WebSocketServer) console.log(`[HTTP-API] WebSocket: ws://localhost:${PORT}/ws`)
  })
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[HTTP-API] Port ${PORT} already in use — skipping`)
    } else {
      console.error('[HTTP-API] Server error:', err)
    }
  })
}

// Export broadcast for use by other modules (e.g. terminal output streaming)
export { wsBroadcast }
