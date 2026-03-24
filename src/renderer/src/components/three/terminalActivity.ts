// ── U20: Terminal Activity — shared state for activity feedback ──
// Global map read by ScreenPanel useFrame (no React re-render needed).
// Written by PbrHoloScene's IPC listener.

/** Per-project terminal activity level (0-100), keyed by projectPath */
export const terminalActivityMap = new Map<string, number>()

/** Current max activity across all sessions — drives sphere feedback */
export let terminalActivityMax = 0

/** Update the max activity value (called from PbrHoloScene IPC listener) */
export function setTerminalActivityMax(value: number): void {
  terminalActivityMax = value
}
