import { useState, useCallback, useRef, useEffect } from 'react'
import type { ProjectInfo } from '../types'

interface Props {
  projects: ProjectInfo[]
  onSearch: (term: string) => void
  onNewProject: () => void
  onConvertProject: (path: string) => void
  onListeningChange: (listening: boolean) => void
}

interface VoiceState {
  listening: boolean
  processing: boolean
  transcript: string
  response: string
  speaking: boolean
}

function findProject(projects: ProjectInfo[], name: string): ProjectInfo | undefined {
  const lower = name.toLowerCase().trim()
  return projects.find((p) =>
    p.name.toLowerCase() === lower ||
    p.name.toLowerCase().replace(/[-_]/g, ' ') === lower ||
    p.name.toLowerCase().includes(lower)
  )
}

export function VoiceController({ projects, onSearch, onNewProject, onConvertProject, onListeningChange }: Props) {
  const [state, setState] = useState<VoiceState>({
    listening: false,
    processing: false,
    transcript: '',
    response: '',
    speaking: false,
  })
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const isHoldingRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const speak = useCallback(async (text: string) => {
    setState((s) => ({ ...s, response: text, speaking: true }))
    try {
      const result = await window.api.voiceSpeak(text, 'narrator', 'en')
      if (result.success && result.audioDataUrl) {
        // Play the audio via base64 data URL (file:// blocked by contextIsolation)
        const audio = new Audio(result.audioDataUrl)
        audioRef.current = audio
        audio.onended = () => setState((s) => ({ ...s, speaking: false }))
        audio.onerror = () => setState((s) => ({ ...s, speaking: false }))
        await audio.play()
      } else {
        setState((s) => ({ ...s, speaking: false }))
      }
    } catch {
      setState((s) => ({ ...s, speaking: false }))
    }
  }, [])

  const handleCommand = useCallback(async (text: string) => {
    const lower = text.toLowerCase().trim()

    // Deploy / Launch
    const deployMatch = lower.match(/^(?:deploy|launch|start|run)\s+(.+)/)
    if (deployMatch) {
      const project = findProject(projects, deployMatch[1])
      if (project) {
        window.api.launchProject(project.path, false)
        speak(`Deploying ${project.name}. Stand by.`)
      } else {
        speak(`Project ${deployMatch[1]} not found in the registry.`)
      }
      return
    }

    // Resume
    const resumeMatch = lower.match(/^(?:resume|continue)\s+(.+)/)
    if (resumeMatch) {
      const project = findProject(projects, resumeMatch[1])
      if (project) {
        window.api.launchProject(project.path, true)
        speak(`Resuming ${project.name}. Session restored.`)
      } else {
        speak(`Project ${resumeMatch[1]} not found.`)
      }
      return
    }

    // Open folder
    const openMatch = lower.match(/^(?:open|files|folder|show)\s+(.+)/)
    if (openMatch) {
      const project = findProject(projects, openMatch[1])
      if (project) {
        window.api.openFolder(project.path)
        speak(`Opening ${project.name} in file explorer.`)
      } else {
        speak(`Project ${openMatch[1]} not found.`)
      }
      return
    }

    // Search
    const searchMatch = lower.match(/^(?:search|find|filter)\s+(.+)/)
    if (searchMatch) {
      onSearch(searchMatch[1])
      speak(`Filtering operations for ${searchMatch[1]}.`)
      return
    }

    // New project
    if (lower.match(/^(?:new|create|init|start new|new project|new operation)/)) {
      onNewProject()
      speak(`Initiating new operation. Standing by for parameters.`)
      return
    }

    // Status
    if (lower.match(/^(?:status|report|sitrep|how many)/)) {
      const ready = projects.filter((p) => p.hasClaude && p.hasBatchFiles && p.hasClaudeDir).length
      const pending = projects.length - ready
      speak(`${projects.length} operations in registry. ${ready} fully operational, ${pending} pending upgrade.`)
      return
    }

    // Clear search
    if (lower.match(/^(?:clear|reset|show all|all)/)) {
      onSearch('')
      speak(`Filters cleared. Showing all operations.`)
      return
    }

    // Fallback — use as search
    onSearch(text)
    speak(`Searching for ${text}.`)
  }, [projects, onSearch, onNewProject, speak])

  const startRecording = useCallback(async () => {
    if (mediaRecorderRef.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })

      chunksRef.current = []
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        if (chunksRef.current.length === 0) return

        setState((s) => ({ ...s, listening: false, processing: true }))
        onListeningChange(false)

        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
          const arrayBuffer = await blob.arrayBuffer()
          const result = await window.api.voiceTranscribe(arrayBuffer)
          if (result.success && result.text) {
            setState((s) => ({ ...s, transcript: result.text, processing: false }))
            handleCommand(result.text)
          } else {
            setState((s) => ({ ...s, processing: false, response: 'Transcription failed.' }))
          }
        } catch {
          setState((s) => ({ ...s, processing: false }))
        }
      }

      mediaRecorder.start(100)
      mediaRecorderRef.current = mediaRecorder
      setState((s) => ({ ...s, listening: true, transcript: '', response: '' }))
      onListeningChange(true)
    } catch {
      console.error('Mic access denied')
    }
  }, [onListeningChange, handleCommand])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
  }, [])

  // Push-to-talk: hold spacebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.code !== 'Space' || isHoldingRef.current) return
      e.preventDefault()
      isHoldingRef.current = true
      startRecording()
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !isHoldingRef.current) return
      e.preventDefault()
      isHoldingRef.current = false
      stopRecording()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [startRecording, stopRecording])

  const visible = state.listening || state.processing || state.transcript || state.response

  return (
    <>
      {/* Voice HUD overlay */}
      {visible && (
        <div className="hal-voice-hud">
          {state.listening && (
            <div className="hal-voice-status listening">
              <span className="hal-voice-dot" />
              LISTENING...
            </div>
          )}
          {state.processing && (
            <div className="hal-voice-status processing">PROCESSING...</div>
          )}
          {state.transcript && (
            <div className="hal-voice-transcript">
              <span className="hal-voice-label">YOU:</span> {state.transcript}
            </div>
          )}
          {state.response && (
            <div className="hal-voice-response">
              <span className="hal-voice-label">HAL:</span> {state.response}
              {state.speaking && <span className="hal-voice-speaking" />}
            </div>
          )}
        </div>
      )}

      {/* Mic button in corner */}
      <button
        className={`hal-mic-float ${state.listening ? 'active' : ''}`}
        onClick={state.listening ? stopRecording : startRecording}
        title="Click or hold SPACE to talk"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {state.listening ? (
            <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" />
          ) : (
            <>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </>
          )}
        </svg>
        {state.listening && <span className="hal-mic-pulse" />}
      </button>
    </>
  )
}
