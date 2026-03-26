/**
 * Auto-select a voice profile based on terminal output context.
 * Used when the user's voice profile setting is 'auto'.
 * VOICE-CLEANUP: Only Hal (butler) and Hallie (soft) voices remain.
 * tts.py handles tone/mood within each voice via the V9 system.
 */
export function selectVoiceProfile(_text: string): string {
  // Default to Hal (butler) — tts.py V9 handles mood/tone automatically
  return 'butler'
}
