import { useState, useCallback, useRef } from 'react'

interface Props {
  enabled: boolean
  profile: string
  onToggle: (enabled: boolean) => void
  onProfileChange: (profile: string) => void
}

const PROFILES = [
  { id: 'auto', label: 'Auto', description: 'AI picks the best voice for the context' },
  { id: 'hal', label: 'HAL (Butler)', description: 'Male, formal, authoritative' },
  { id: 'hallie', label: 'Hallie (Soft)', description: 'Female, warm, conversational' },
]

export function Step3Voice({ enabled, profile, onToggle, onProfileChange }: Props) {
  const [micStatus, setMicStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDone, setRecordingDone] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const requestMic = useCallback(async () => {
    setMicStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      setMicStatus('granted')
      // Stop tracks immediately, we just wanted permission
      stream.getTracks().forEach(t => t.stop())
    } catch {
      setMicStatus('denied')
    }
  }, [])

  const handleTestRecording = useCallback(async () => {
    if (isRecording) {
      // Stop recording
      mediaRecorderRef.current?.stop()
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      setMicStatus('granted')

      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      setIsRecording(true)

      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        setIsRecording(false)
        setRecordingDone(true)
        // Could play back the recording, but keeping it simple for now
      }

      recorder.start()
      // Auto-stop after 3 seconds
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop()
        }
      }, 3000)
    } catch {
      setMicStatus('denied')
    }
  }, [isRecording])

  return (
    <div style={styles.wrapper}>
      <h2 style={styles.heading}>Voice Control</h2>
      <p style={styles.subheading}>Enable voice input and output?</p>
      <p style={styles.changeLater}>You can change this later in Settings. Voice is completely optional.</p>

      {/* Toggle */}
      <div style={styles.toggleRow}>
        <span style={styles.toggleLabel}>Voice Features</span>
        <button
          onClick={() => onToggle(!enabled)}
          style={{
            ...styles.toggle,
            background: enabled ? 'var(--primary)' : 'var(--border)',
          }}
        >
          <div style={{
            ...styles.toggleKnob,
            transform: enabled ? 'translateX(20px)' : 'translateX(2px)',
          }} />
        </button>
        <span style={styles.toggleState}>{enabled ? 'Enabled' : 'Disabled'}</span>
      </div>

      {!enabled && (
        <div style={styles.skipNote}>
          Voice is completely optional. You can enable it anytime in Settings.
        </div>
      )}

      {enabled && (
        <>
          {/* Mic permission */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Microphone</h3>
            {micStatus === 'idle' && (
              <button onClick={requestMic} style={styles.actionBtn}>
                Request Microphone Access
              </button>
            )}
            {micStatus === 'requesting' && (
              <span style={styles.statusText}>Requesting access...</span>
            )}
            {micStatus === 'granted' && (
              <div style={styles.statusRow}>
                <span style={{ ...styles.statusText, color: 'var(--success)' }}>
                  Microphone access granted
                </span>
                <button
                  onClick={handleTestRecording}
                  style={{
                    ...styles.actionBtn,
                    ...(isRecording ? { background: 'var(--error)' } : {}),
                  }}
                >
                  {isRecording ? 'Recording... (3s)' : recordingDone ? 'Test Again' : 'Test Recording'}
                </button>
              </div>
            )}
            {micStatus === 'denied' && (
              <span style={{ ...styles.statusText, color: 'var(--warning)' }}>
                Microphone denied. Voice input will be text-only. You can grant access later in your browser settings.
              </span>
            )}
          </div>

          {/* Profile picker */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Voice Profile</h3>
            <div style={styles.profileGrid}>
              {PROFILES.map((p) => {
                const isSelected = profile === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => onProfileChange(p.id)}
                    style={{
                      ...styles.profileCard,
                      ...(isSelected ? styles.profileCardSelected : {}),
                    }}
                  >
                    <span style={{
                      ...styles.profileName,
                      color: isSelected ? 'var(--primary)' : 'var(--text)',
                    }}>
                      {p.label}
                    </span>
                    <span style={styles.profileDesc}>{p.description}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={styles.shortcutHint}>
            Push-to-talk shortcut: <kbd style={styles.kbd}>CTRL</kbd> + <kbd style={styles.kbd}>SPACE</kbd>
          </div>
        </>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 24,
    maxWidth: 560,
    margin: '0 auto',
  },
  heading: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 6,
    color: 'var(--text)',
  },
  subheading: {
    fontSize: 15,
    color: 'var(--text-secondary)',
    marginBottom: 4,
  },
  changeLater: {
    fontSize: 12,
    color: 'var(--text-dim)',
    marginBottom: 24,
    fontStyle: 'italic',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '16px 24px',
    borderRadius: 'var(--radius)',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    width: '100%',
    marginBottom: 16,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text)',
    flex: 1,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    border: 'none',
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'background 0.2s ease',
    flexShrink: 0,
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute' as const,
    top: 2,
    transition: 'transform 0.2s ease',
  },
  toggleState: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    minWidth: 60,
  },
  skipNote: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    fontSize: 13,
    color: 'var(--text-dim)',
    textAlign: 'center' as const,
  },
  section: {
    width: '100%',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 10,
  },
  actionBtn: {
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  statusText: {
    fontSize: 13,
    color: 'var(--text-secondary)',
  },
  profileGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
  },
  profileCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '14px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '2px solid var(--border)',
    background: 'var(--bg-surface)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'center' as const,
    outline: 'none',
  },
  profileCardSelected: {
    borderColor: 'var(--primary)',
    background: 'color-mix(in srgb, var(--primary) 8%, var(--bg-surface))',
  },
  profileName: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 4,
    transition: 'color 0.2s ease',
  },
  profileDesc: {
    fontSize: 11,
    color: 'var(--text-dim)',
    lineHeight: 1.3,
  },
  shortcutHint: {
    marginTop: 8,
    fontSize: 12,
    color: 'var(--text-dim)',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  kbd: {
    padding: '2px 6px',
    borderRadius: 3,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    fontSize: 11,
    fontFamily: 'monospace',
    color: 'var(--text-secondary)',
  },
}
