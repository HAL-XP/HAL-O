// ── IPC Handler Registry ──
// Split into domain files for parallel agent development:
//   ipc-setup.ts    — Agent D (Wizard + UX): prerequisites, API key, gh CLI
//   ipc-hub.ts      — Agent B (Terminal + Core): project scanning, launching
//   ipc-wizard.ts   — Agent D (Wizard + UX): project analysis, creation
//   ipc-terminal.ts — Agent B (Terminal + Core): pty lifecycle
//   ipc-voice.ts    — Agent C (Audio/Voice): STT, TTS
//   ipc-shared.ts   — Shared utilities (run, findApiKey, ProjectConfig)

import { registerSetupHandlers } from './ipc-setup'
import { registerHubHandlers } from './ipc-hub'
import { registerWizardHandlers } from './ipc-wizard'
import { registerTerminalHandlers } from './ipc-terminal'
import { registerVoiceHandlers } from './ipc-voice'
import { registerUpgradeHandlers } from './ipc-upgrade'
import { registerModelHandlers } from './ipc-models'
import { registerMergeHandlers } from './ipc-merge'
import { registerDispatcherHandlers } from './ipc-dispatcher'
import { registerTreeHandlers } from './ipc-tree'
import { registerFeatureFlagHandlers } from './feature-flags'
import { startHttpApi } from './http-api'

export function registerIpcHandlers(): void {
  registerSetupHandlers()
  registerHubHandlers()
  registerWizardHandlers()
  registerTerminalHandlers()
  registerVoiceHandlers()
  registerUpgradeHandlers()
  registerModelHandlers()
  registerMergeHandlers()
  registerDispatcherHandlers()
  registerTreeHandlers()
  registerFeatureFlagHandlers()
  startHttpApi()
}
