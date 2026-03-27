// ── Telegram Bot Handler ──
// Own TG polling handler in Electron main process.
// Replaces Claude's --channels plugin for dispatch-aware routing.
// Messages → transcribe → dispatch → forward to right terminal → reply

import { exec } from 'child_process'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { terminalManager } from './terminal-manager'
import { dispatchMessage, setStickySession, matchVoiceSwitch, getActiveTerminals } from './dispatcher'

// ── Config ──

interface TelegramConfig {
  botToken: string
  chatId: string
}

function loadConfig(): TelegramConfig | null {
  // Read from ~/.claude_credentials
  try {
    const credPath = join(process.env.USERPROFILE || process.env.HOME || '', '.claude_credentials')
    if (!existsSync(credPath)) return null
    const content = readFileSync(credPath, 'utf-8')
    const tokenMatch = content.match(/TELEGRAM_BOT_TOKEN=["']?([^"'\s\r\n]+)/)
    const chatMatch = content.match(/TELEGRAM_CHAT_ID=["']?([^"'\s\r\n]+)/)
    if (!tokenMatch || !chatMatch) return null
    return { botToken: tokenMatch[1], chatId: chatMatch[1] }
  } catch {
    return null
  }
}

// ── Polling ──

let _polling = false
let _pollTimeout: ReturnType<typeof setTimeout> | null = null
let _lastUpdateId = 0
let _config: TelegramConfig | null = null

async function tgApi(method: string, params?: Record<string, unknown>): Promise<unknown> {
  if (!_config) return null
  const url = `https://api.telegram.org/bot${_config.botToken}/${method}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: params ? JSON.stringify(params) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  const data = await resp.json() as { ok: boolean; result: unknown }
  return data.ok ? data.result : null
}

async function sendReply(text: string, chatId?: string): Promise<void> {
  await tgApi('sendMessage', { chat_id: chatId || _config?.chatId, text })
}

async function sendVoiceReply(text: string, chatId?: string): Promise<void> {
  // Generate TTS and send as voice message
  const outPath = join(process.env.TEMP || '/tmp', 'hal_tg_dispatch_reply.ogg')
  const ttsScript = join(process.env.USERPROFILE || '', '.claude', 'scripts', 'tts.py')

  return new Promise((resolve) => {
    exec(`python "${ttsScript}" "${text.replace(/"/g, '\\"')}" "${outPath}" butler en`, {
      timeout: 30_000, windowsHide: true,
    }, async (err) => {
      if (err || !existsSync(outPath)) {
        // Fallback to text
        await sendReply(text, chatId)
      } else {
        // Send voice file via TG API (multipart upload)
        try {
          const FormData = (await import('node:buffer')).Buffer // For file upload
          const fileContent = readFileSync(outPath)
          const boundary = '----HalOBoundary' + Date.now()
          const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId || _config?.chatId}\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="voice"; filename="reply.ogg"\r\nContent-Type: audio/ogg\r\n\r\n`),
            fileContent,
            Buffer.from(`\r\n--${boundary}--\r\n`),
          ])
          await fetch(`https://api.telegram.org/bot${_config?.botToken}/sendVoice`, {
            method: 'POST',
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            body,
            signal: AbortSignal.timeout(15_000),
          })
        } catch {
          await sendReply(text, chatId)
        }
      }
      resolve()
    })
  })
}

async function transcribeVoice(fileId: string): Promise<string> {
  // Download voice file from TG
  if (!_config) return ''
  const fileInfo = await tgApi('getFile', { file_id: fileId }) as { file_path: string } | null
  if (!fileInfo?.file_path) return ''

  const url = `https://api.telegram.org/file/bot${_config.botToken}/${fileInfo.file_path}`
  const inboxDir = join(process.env.USERPROFILE || '', '.claude', 'channels', 'telegram', 'inbox')
  if (!existsSync(inboxDir)) mkdirSync(inboxDir, { recursive: true })
  const localPath = join(inboxDir, `dispatch-${Date.now()}.oga`)

  // Download
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  const buf = Buffer.from(await resp.arrayBuffer())
  writeFileSync(localPath, buf)

  // Transcribe
  const transcribeScript = join(process.env.USERPROFILE || '', '.claude', 'scripts', 'transcribe.py')
  return new Promise((resolve) => {
    exec(`python "${transcribeScript}" "${localPath}"`, {
      timeout: 30_000, windowsHide: true,
    }, (err, stdout) => {
      resolve(err ? '' : stdout.trim())
    })
  })
}

// ── Message Handler ──

async function handleMessage(msg: { message_id: number; chat: { id: number }; text?: string; voice?: { file_id: string } }): Promise<void> {
  const chatId = String(msg.chat.id)

  // Only respond to allowed chat
  if (chatId !== _config?.chatId) return

  let text = msg.text || ''

  // Transcribe voice
  if (msg.voice) {
    text = await transcribeVoice(msg.voice.file_id)
    if (!text) {
      await sendReply('[Hal-O] Could not transcribe voice message.', chatId)
      return
    }
  }

  if (!text.trim()) return

  // Check for voice switch command first
  const terminals = getActiveTerminals()
  const switchResult = matchVoiceSwitch(text, terminals)

  if (switchResult.type === 'list') {
    const names = terminals.map(t => `• ${t.projectName}`).join('\n')
    await sendReply(`[Hal-O] Active projects:\n${names || '(none)'}`, chatId)
    return
  }

  if (switchResult.type === 'switch' && switchResult.sessionId) {
    setStickySession(switchResult.sessionId)
    await sendReply(`[Hal-O] Switched to: ${switchResult.projectName}`, chatId)
    return
  }

  // Dispatch message to right terminal
  const result = dispatchMessage(text)

  if (!result.sessionId) {
    await sendReply('[Hal-O] No active terminal sessions. Open a project first.', chatId)
    return
  }

  // Forward to terminal
  const prefix = result.projectName && result.confidence > 0.5
    ? `[voice → ${result.projectName}]`
    : '[voice]'
  terminalManager.write(result.sessionId, `${prefix} ${result.cleanMessage || text}\r`)

  // React to confirm receipt
  await tgApi('setMessageReaction', {
    chat_id: chatId,
    message_id: msg.message_id,
    reaction: [{ type: 'emoji', emoji: '👍' }],
  })
}

// ── Poll Loop ──

async function poll(): Promise<void> {
  if (!_polling || !_config) return

  try {
    const updates = await tgApi('getUpdates', {
      offset: _lastUpdateId + 1,
      timeout: 20, // long-poll 20s
      allowed_updates: ['message'],
    }) as Array<{ update_id: number; message?: unknown }> | null

    if (updates && updates.length > 0) {
      for (const u of updates) {
        _lastUpdateId = u.update_id
        if (u.message) {
          handleMessage(u.message as Parameters<typeof handleMessage>[0]).catch(() => {})
        }
      }
    }
  } catch {
    // Network error — retry in 5s
    _pollTimeout = setTimeout(poll, 5000)
    return
  }

  // Schedule next poll immediately
  if (_polling) {
    _pollTimeout = setTimeout(poll, 100)
  }
}

// ── Public API ──

export function startTelegramHandler(): boolean {
  _config = loadConfig()
  if (!_config) {
    console.log('[TG-Handler] No bot token/chat ID configured, skipping')
    return false
  }

  // Don't start in test mode
  if (process.argv.includes('--fast-wizards') || process.env.NODE_ENV === 'test') {
    console.log('[TG-Handler] Test mode, skipping')
    return false
  }

  _polling = true
  console.log('[TG-Handler] Starting Telegram polling...')
  poll()
  return true
}

export function stopTelegramHandler(): void {
  _polling = false
  if (_pollTimeout) {
    clearTimeout(_pollTimeout)
    _pollTimeout = null
  }
  console.log('[TG-Handler] Stopped')
}

export function isTelegramHandlerActive(): boolean {
  return _polling
}
