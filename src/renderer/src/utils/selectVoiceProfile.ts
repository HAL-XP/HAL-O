/**
 * Auto-select a voice profile based on terminal output context.
 * Used when the user's voice profile setting is 'auto'.
 */
export function selectVoiceProfile(text: string): string {
  const lower = text.toLowerCase()

  // Check for errors/failures first (highest priority)
  if (/\b(error|fail(ed|ure)?|exception|fatal|panic|crash|abort)\b/.test(lower)) {
    return 'drill_sergeant'
  }

  // Check for warnings
  if (/\b(warn(ing)?|deprecated|caution)\b/.test(lower)) {
    return 'wizard'
  }

  // Check for success/completion
  if (/\b(success(ful(ly)?)?|complete[d]?|done|pass(ed)?|finished|built|deployed)\b/.test(lower)) {
    return 'pirate'
  }

  // Default
  return 'narrator'
}
