// ── HAL-O Adaptive Tips Engine ──
// Pre-cooked tips shown based on user's feature usage and session count.
// Zero LLM cost — pure static text.

export interface Tip {
  id: string
  text: string
  /** Which feature this tip teaches (used for discovery tracking) */
  feature: string
  /** Don't show this tip before N sessions */
  minSessionCount: number
  /** Stop showing after N sessions (0 = show forever) */
  maxSessionCount: number
  /** Higher = shown first when multiple tips are eligible */
  priority: number
}

export const TIPS: Tip[] = [
  {
    id: 'voice-ctrl-space',
    text: "Press CTRL+SPACE to talk to HAL by voice",
    feature: 'voice-input',
    minSessionCount: 0,
    maxSessionCount: 10,
    priority: 100,
  },
  {
    id: 'cmd-yours',
    text: "Type 'yours' to give HAL full autonomy over the app",
    feature: 'cmd-yours',
    minSessionCount: 2,
    maxSessionCount: 0,
    priority: 95,
  },
  {
    id: 'cmd-ci',
    text: "Type 'ci' to check GitHub Actions status",
    feature: 'cmd-ci',
    minSessionCount: 1,
    maxSessionCount: 20,
    priority: 80,
  },
  {
    id: 'cmd-push',
    text: "Type 'push' to commit and push in one word",
    feature: 'cmd-push',
    minSessionCount: 1,
    maxSessionCount: 20,
    priority: 78,
  },
  {
    id: 'cmd-board',
    text: "Type 'board' for a visual Kanban dashboard",
    feature: 'cmd-board',
    minSessionCount: 3,
    maxSessionCount: 0,
    priority: 70,
  },
  {
    id: 'cmd-recap',
    text: "Type 'recap' for a session summary",
    feature: 'cmd-recap',
    minSessionCount: 2,
    maxSessionCount: 0,
    priority: 75,
  },
  {
    id: 'cmd-qa',
    text: "Type 'qa' to spawn a QA reviewer",
    feature: 'cmd-qa',
    minSessionCount: 3,
    maxSessionCount: 0,
    priority: 65,
  },
  {
    id: 'split-panes',
    text: "Drag a terminal tab to the edge to split panes",
    feature: 'split-panes',
    minSessionCount: 1,
    maxSessionCount: 15,
    priority: 85,
  },
  {
    id: 'terminal-ctx-menu',
    text: "Right-click a terminal tab for options",
    feature: 'terminal-context-menu',
    minSessionCount: 0,
    maxSessionCount: 10,
    priority: 82,
  },
  {
    id: 'voice-personality',
    text: "Change your AI's personality in Settings \u2192 Voice",
    feature: 'personality-settings',
    minSessionCount: 2,
    maxSessionCount: 0,
    priority: 60,
  },
  {
    id: 'cmd-nuke',
    text: "Type 'nuke' to clear all caches and rebuild",
    feature: 'cmd-nuke',
    minSessionCount: 5,
    maxSessionCount: 0,
    priority: 50,
  },
  {
    id: 'sphere-status',
    text: "The 3D sphere shows HAL's status \u2014 click it for voice",
    feature: 'sphere-click',
    minSessionCount: 0,
    maxSessionCount: 8,
    priority: 90,
  },
  {
    id: 'easter-pod-bay',
    text: "Open the pod bay doors, HAL... try it",
    feature: 'easter-pod-bay',
    minSessionCount: 4,
    maxSessionCount: 0,
    priority: 30,
  },
  {
    id: 'renderer-switch',
    text: "Switch between 3 renderers in Settings \u2192 Renderer",
    feature: 'renderer-switch',
    minSessionCount: 1,
    maxSessionCount: 12,
    priority: 72,
  },
  {
    id: 'easter-zog',
    text: "Try 'zog zog' for a surprise",
    feature: 'easter-zog',
    minSessionCount: 6,
    maxSessionCount: 0,
    priority: 25,
  },
  {
    id: 'focus-zones',
    text: "Press CTRL+` to switch focus between hub and terminal",
    feature: 'focus-zones',
    minSessionCount: 1,
    maxSessionCount: 15,
    priority: 83,
  },
  {
    id: 'keyboard-nav',
    text: "Use arrow keys to navigate projects in the hub",
    feature: 'keyboard-nav',
    minSessionCount: 0,
    maxSessionCount: 10,
    priority: 76,
  },
  {
    id: 'cmd-afk',
    text: "Type 'afk' to get Telegram updates while you're away",
    feature: 'cmd-afk',
    minSessionCount: 3,
    maxSessionCount: 0,
    priority: 55,
  },
]
