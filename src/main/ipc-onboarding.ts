// ── First-Launch Onboarding IPC handlers ──
// Owner: Agent B (Terminal + Core)

import { ipcMain } from 'electron'
import { existsSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { dataPath } from './instance'

const WIZARD_COMPLETE_FILE = dataPath('wizard-complete.json')

export function registerOnboardingHandlers(): void {
  // Check if this is the first launch (wizard-complete.json missing)
  ipcMain.handle('wizard:is-first-launch', async () => {
    return !existsSync(WIZARD_COMPLETE_FILE)
  })

  // Mark wizard as complete — write wizard-complete.json with chosen config
  ipcMain.handle('wizard:complete', async (_event, config: Record<string, unknown>) => {
    try {
      const dir = dirname(WIZARD_COMPLETE_FILE)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const data = {
        completedAt: new Date().toISOString(),
        ...config,
      }
      writeFileSync(WIZARD_COMPLETE_FILE, JSON.stringify(data, null, 2), 'utf-8')
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })
}
