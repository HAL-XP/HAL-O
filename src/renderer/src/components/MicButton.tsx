import { useState, useRef, useCallback, useEffect } from 'react'

interface Props {
  onTranscript: (text: string) => void
  onListeningChange?: (listening: boolean) => void
}

const MIN_RECORDING_MS = 800 // ignore recordings shorter than this

export function MicButton({ onTranscript, onListeningChange }: Props) {
  const [listening, setListening] = useState(false)
  const [processing, setProcessing] = useState(false)
  const recordStartRef = useRef(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const isHoldingRef = useRef(false)

  const startRecording = useCallback(async () => {
    if (mediaRecorderRef.current) return // already recording

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
        const duration = Date.now() - recordStartRef.current
        if (chunksRef.current.length === 0 || duration < MIN_RECORDING_MS) return

        setProcessing(true)
        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
          const arrayBuffer = await blob.arrayBuffer()
          const result = await window.api.voiceTranscribe(arrayBuffer)
          if (result.success && result.text) {
            onTranscript(result.text)
          }
        } catch (err) {
          console.error('Transcription failed:', err)
        } finally {
          setProcessing(false)
        }
      }

      mediaRecorder.start(100)
      mediaRecorderRef.current = mediaRecorder
      recordStartRef.current = Date.now()
      setListening(true)
      onListeningChange?.(true)
    } catch (err) {
      console.error('Mic access denied:', err)
    }
  }, [onTranscript, onListeningChange])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    setListening(false)
    onListeningChange?.(false)
  }, [onListeningChange])

  // Push-to-talk: hold CTRL+SPACE to record (works even when terminal is focused)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.code !== 'Space') return
      if (isHoldingRef.current) return // prevent key repeat

      e.preventDefault()
      e.stopPropagation()
      isHoldingRef.current = true
      startRecording()
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if (!isHoldingRef.current) return

      e.preventDefault()
      e.stopPropagation()
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

  // Click toggle (alternative to push-to-talk)
  const toggle = useCallback(() => {
    if (listening) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [listening, startRecording, stopRecording])

  return (
    <button
      className={`hal-mic ${listening ? 'active' : ''} ${processing ? 'processing' : ''}`}
      onClick={toggle}
      disabled={processing}
      title={listening ? 'Release to send (or release CTRL+SPACE)' : 'Click or hold CTRL+SPACE to talk'}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        {listening ? (
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
      {listening && <span className="hal-mic-pulse" />}
      {processing && <span className="hal-mic-label">PROCESSING...</span>}
    </button>
  )
}
