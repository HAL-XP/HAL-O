import { contextBridge, ipcRenderer } from 'electron'

// ── Local type aliases (mirror src/renderer/src/types.ts — keep in sync) ──

interface EnlistConfig {
  projectPath: string
  agentName: string
  addLaunchScripts: boolean
  addClaudeDir: boolean
  addClaudeMd: 'skip' | 'create' | 'append'
  addHooks: boolean
  hooksSetup: string[]
  techStack: string
  languages: string[]
  description: string
  addRules?: string[]
  addDevlog?: string[]
  addMemorySeed?: boolean
  addAgentTemplates?: boolean
}

interface ProjectStats {
  lastCommit: string
  lastCommitTime: number
  commitCount30d: number
  fileCount: number
}

interface ProjectInfo {
  name: string
  path: string
  stack: string
  hasClaude: boolean
  hasBatchFiles: boolean
  hasClaudeDir: boolean
  hasHalOMeta: boolean
  configLevel: 'bare' | 'claude-aware' | 'hal-o-enhanced'
  lastModified: number
  gitOwner: string
  runCmd: string
  rulesOutdated?: boolean
  demoStats?: ProjectStats
}

interface EnlistResult {
  success: boolean
  log: string[]
  path: string
}

const api = {
  // Setup
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  getGhInstallLabel: () => ipcRenderer.invoke('get-gh-install-label'),
  checkPrerequisites: () => ipcRenderer.invoke('check-prerequisites'),
  saveApiKey: (key: string, location: string) => ipcRenderer.invoke('save-api-key', key, location),
  getInstallLabels: () => ipcRenderer.invoke('get-install-labels'),
  installGit: () => ipcRenderer.invoke('install-git'),
  installGhCli: () => ipcRenderer.invoke('install-gh-cli'),
  installPython: () => ipcRenderer.invoke('install-python'),
  installClaudeCli: () => ipcRenderer.invoke('install-claude-cli'),
  installFfmpeg: () => ipcRenderer.invoke('install-ffmpeg'),
  authGhCli: () => ipcRenderer.invoke('auth-gh-cli'),

  // Hub
  scanProjects: (): Promise<ProjectInfo[]> => ipcRenderer.invoke('scan-projects'),
  launchProject: (path: string, resume: boolean) => ipcRenderer.invoke('launch-project', path, resume),
  getLaunchArgs: () => ipcRenderer.invoke('get-launch-args'),
  getProjectStats: (path: string): Promise<ProjectStats | null> => ipcRenderer.invoke('get-project-stats', path),

  // Wizard
  getDefaultProjectPath: () => ipcRenderer.invoke('get-default-project-path'),
  selectFolder: (defaultPath?: string) => ipcRenderer.invoke('select-folder', defaultPath),
  getGitHubUser: () => ipcRenderer.invoke('get-github-user'),
  getGitHubOrgs: () => ipcRenderer.invoke('get-github-orgs'),
  scanExistingProject: (projectPath: string) => ipcRenderer.invoke('scan-existing-project', projectPath),
  enlistProject: (config: EnlistConfig): Promise<EnlistResult> => ipcRenderer.invoke('enlist-project', config),
  analyzeProject: (name: string, description: string, folderPath: string, lang?: string) => ipcRenderer.invoke('analyze-project', name, description, folderPath, lang),
  createProject: (config: Record<string, unknown>): Promise<{ success: boolean; path?: string; log: string[] }> => ipcRenderer.invoke('create-project', config),
  openFolder: (path: string) => ipcRenderer.invoke('open-folder', path),
  runApp: (projectPath: string, runCmd: string) => ipcRenderer.invoke('run-app', projectPath, runCmd),
  openInClaude: (path: string) => ipcRenderer.invoke('open-in-claude', path),
  openInIde: (path: string, ideId?: string): Promise<{ success: boolean; ide?: string; error?: string }> =>
    ipcRenderer.invoke('open-in-ide', path, ideId),
  resolveIde: (projectPath: string, perProjectIde?: string | null, globalDefault?: string | null): Promise<{ id: string; name: string; shortLabel: string } | null> =>
    ipcRenderer.invoke('resolve-ide', projectPath, perProjectIde, globalDefault),
  detectProjectIde: (projectPath: string): Promise<string | null> =>
    ipcRenderer.invoke('detect-project-ide', projectPath),
  getAvailableIdes: (): Promise<Array<{ id: string; name: string; shortLabel: string; available: boolean }>> =>
    ipcRenderer.invoke('get-available-ides'),
  openExternalTerminal: (projectPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('open-external-terminal', projectPath),

  // Session absorption
  detectExternalSessions: () => ipcRenderer.invoke('detect-external-sessions'),
  absorbSession: (info: { pid: number; projectPath: string; projectName: string }) =>
    ipcRenderer.invoke('absorb-session', info),

  // Continuation (D4)
  writeContinuation: (data: { step: string; reason: string; message: string }) =>
    ipcRenderer.invoke('write-continuation', data),
  readContinuation: () => ipcRenderer.invoke('read-continuation'),

  // Statusline (D8)
  checkStatusline: () => ipcRenderer.invoke('check-statusline'),
  configureStatusline: () => ipcRenderer.invoke('configure-statusline'),

  // Dev tools setup (D2)
  setupDevTools: (projectPath: string) => ipcRenderer.invoke('setup-dev-tools', projectPath),
  writeDevToolsMeta: (projectPath: string, preference: 'later' | 'never') =>
    ipcRenderer.invoke('write-dev-tools-meta', projectPath, preference),

  // S5: Versioning upgrade system
  checkUpgradeAvailable: (projectPath: string) => ipcRenderer.invoke('check-upgrade-available', projectPath),
  previewUpgrade: (projectPath: string) => ipcRenderer.invoke('preview-upgrade', projectPath),
  applyUpgrade: (projectPath: string, acceptedSectionIds: string[]) =>
    ipcRenderer.invoke('apply-upgrade', projectPath, acceptedSectionIds),
  rollbackUpgrade: (projectPath: string, backupPath: string) =>
    ipcRenderer.invoke('rollback-upgrade', projectPath, backupPath),
  listUpgradeBackups: (projectPath: string) => ipcRenderer.invoke('list-upgrade-backups', projectPath),

  // Dev
  captureScreenshot: () => ipcRenderer.invoke('capture-screenshot'),
  reloadRenderer: () => ipcRenderer.invoke('reload-renderer'),
  ptyPopExternal: (sessionId: string) => ipcRenderer.invoke('pty-pop-external', sessionId),
  ptyPreRestart: () => ipcRenderer.invoke('pty-pre-restart'),
  ptyCheckPending: () => ipcRenderer.invoke('pty-check-pending'),

  // Terminal (pty)
  ptySpawn: (options: {
    id: string; cwd: string; cmd: string; args: string[]
    cols: number; rows: number; projectName: string
  }) => ipcRenderer.invoke('pty-spawn', options),
  ptyInput: (id: string, data: string) => ipcRenderer.invoke('pty-input', id, data),
  ptyResize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('pty-resize', id, cols, rows),
  ptyClose: (id: string) => ipcRenderer.invoke('pty-close', id),
  ptyScrollback: (id: string) => ipcRenderer.invoke('pty-scrollback', id),
  ptySessions: () => ipcRenderer.invoke('pty-sessions'),
  onPtyData: (id: string, callback: (data: string) => void) => {
    const channel = `pty-data-${id}`
    const listener = (_: unknown, data: string) => callback(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  onPtyExit: (id: string, callback: (info: { code: number }) => void) => {
    const channel = `pty-exit-${id}`
    const listener = (_: unknown, info: { code: number }) => callback(info)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  // Voice
  voiceTranscribe: (audioBuffer: ArrayBuffer) => ipcRenderer.invoke('voice-transcribe', audioBuffer),
  voiceSpeak: (text: string, profile?: string, lang?: string) => ipcRenderer.invoke('voice-speak', text, profile, lang),

  // Personality (TARS system)
  writePersonality: (data: Record<string, unknown>) => ipcRenderer.invoke('write-personality', data),
  readPersonality: () => ipcRenderer.invoke('read-personality'),

  // System (X8: watchdog heartbeat)
  getLaunchOnStartup: (): Promise<boolean> => ipcRenderer.invoke('get-launch-on-startup'),
  setLaunchOnStartup: (enabled: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('set-launch-on-startup', enabled),

  // Dev: 2D Preview Mode toggle
  onToggle2dPreview: (callback: (enabled: boolean) => void) => {
    const listener = (_: unknown, enabled: boolean) => callback(enabled)
    ipcRenderer.on('toggle-2d-preview', listener)
    return () => ipcRenderer.removeListener('toggle-2d-preview', listener)
  },

  // Perf: window focus/blur — renderer uses this to throttle frame rate
  onWindowFocusChange: (callback: (focused: boolean) => void) => {
    const listener = (_: unknown, focused: boolean) => callback(focused)
    ipcRenderer.on('window-focus-change', listener)
    return () => ipcRenderer.removeListener('window-focus-change', listener)
  },

  // Clipboard (works in all Electron security contexts)
  copyToClipboard: (text: string) => ipcRenderer.invoke('copy-to-clipboard', text),

  // A11: "Ship it!" flyby — triggered when git push is detected in a terminal
  onShipItFlyby: (callback: (info: { projectPath: string; projectName: string; shipIndex: number }) => void) => {
    const listener = (_: unknown, info: { projectPath: string; projectName: string; shipIndex: number }) => callback(info)
    ipcRenderer.on('ship-it-flyby', listener)
    return () => ipcRenderer.removeListener('ship-it-flyby', listener)
  },

  // M2: Cinematic demo mode — scripted camera sequence for marketing/trade shows
  onToggleCinematic: (callback: (enabled: boolean) => void) => {
    const listener = (_: unknown, enabled: boolean) => callback(enabled)
    ipcRenderer.on('toggle-cinematic', listener)
    return () => ipcRenderer.removeListener('toggle-cinematic', listener)
  },

  // U20: Terminal activity feedback — bytes/sec metering from PTY sessions
  onTerminalActivity: (callback: (info: { sessionId: string; projectPath: string; activityLevel: number }) => void) => {
    const listener = (_: unknown, info: { sessionId: string; projectPath: string; activityLevel: number }) => callback(info)
    ipcRenderer.on('terminal-activity', listener)
    return () => ipcRenderer.removeListener('terminal-activity', listener)
  },
}

contextBridge.exposeInMainWorld('api', api)
