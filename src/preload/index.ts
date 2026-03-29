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
  detectSubscriptionType: (): Promise<{ type: 'api' | 'subscription' | 'unknown'; hasApiKey: boolean }> =>
    ipcRenderer.invoke('detect-subscription-type'),

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

  // Favorites (B37: dual-persist — localStorage + file backup)
  saveFavorites: (paths: string[]) => ipcRenderer.invoke('save-favorites', paths),
  loadFavorites: (): Promise<string[]> => ipcRenderer.invoke('load-favorites'),

  // Personality (TARS system)
  writePersonality: (data: Record<string, unknown>) => ipcRenderer.invoke('write-personality', data),
  readPersonality: () => ipcRenderer.invoke('read-personality'),

  // HAL-COMPACT-UX: StatusLine sidecar data (context %, cost, model)
  readStatusline: (): Promise<any> => ipcRenderer.invoke('read-statusline'),

  // System (X8: watchdog heartbeat)
  getLaunchOnStartup: (): Promise<boolean> => ipcRenderer.invoke('get-launch-on-startup'),
  setLaunchOnStartup: (enabled: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('set-launch-on-startup', enabled),

  // Model providers (X7)
  getAvailableModels: () => ipcRenderer.invoke('get-available-models'),
  setTerminalModel: (sessionId: string, modelId: string | null) =>
    ipcRenderer.invoke('set-terminal-model', sessionId, modelId),
  getTerminalModel: (sessionId: string): Promise<string | null> =>
    ipcRenderer.invoke('get-terminal-model', sessionId),
  refreshModelProviders: () => ipcRenderer.invoke('refresh-model-providers'),
  listOllamaModels: () => ipcRenderer.invoke('list-ollama-models'),
  pullOllamaModel: (modelName: string) => ipcRenderer.invoke('pull-ollama-model', modelName),
  getModelRouting: () => ipcRenderer.invoke('get-model-routing'),
  setModelRouting: (preset: string, config: Record<string, string>) =>
    ipcRenderer.invoke('set-model-routing', preset, config),
  getModelPresets: () => ipcRenderer.invoke('get-model-presets'),
  testOllamaChat: (model: string, prompt: string) =>
    ipcRenderer.invoke('test-ollama-chat', model, prompt),

  // Dispatcher
  dispatchMessage: (message: string) => ipcRenderer.invoke('dispatch-message', message),
  setStickySession: (sessionId: string | null) => ipcRenderer.invoke('set-sticky-session', sessionId),
  getStickySession: () => ipcRenderer.invoke('get-sticky-session'),
  getVoiceForProject: (projectName: string): Promise<string | null> => ipcRenderer.invoke('get-voice-for-project', projectName),

  // Tree CRUD
  treeGet: () => ipcRenderer.invoke('tree-get'),
  treeGetNode: (id: string) => ipcRenderer.invoke('tree-get-node', id),
  treeGetRoot: () => ipcRenderer.invoke('tree-get-root'),
  treeGetChildren: (parentId: string) => ipcRenderer.invoke('tree-get-children', parentId),
  treeGetAll: () => ipcRenderer.invoke('tree-get-all'),
  treeCreate: (type: string, name: string, parentId: string, options?: any) => ipcRenderer.invoke('tree-create', type, name, parentId, options),
  treeUpdate: (id: string, updates: any) => ipcRenderer.invoke('tree-update', id, updates),
  treeDelete: (id: string) => ipcRenderer.invoke('tree-delete', id),
  treeMove: (id: string, newParentId: string) => ipcRenderer.invoke('tree-move', id, newParentId),

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

  // U18: Merge conflict detection & resolution
  detectMergeConflicts: (projectPath: string) => ipcRenderer.invoke('detect-merge-conflicts', projectPath),
  checkMergeState: (projectPath: string): Promise<boolean> => ipcRenderer.invoke('check-merge-state', projectPath),
  parseConflictFile: (projectPath: string, filePath: string) => ipcRenderer.invoke('parse-conflict-file', projectPath, filePath),
  resolveConflictChunk: (projectPath: string, filePath: string, chunkId: number, resolution: string, customContent?: string) =>
    ipcRenderer.invoke('resolve-conflict-chunk', projectPath, filePath, chunkId, resolution, customContent),
  resolveConflictFile: (projectPath: string, filePath: string, resolutions: Array<{ chunkId: number; resolution: string; customContent?: string }>) =>
    ipcRenderer.invoke('resolve-conflict-file', projectPath, filePath, resolutions),
  completeMerge: (projectPath: string, commitMessage?: string): Promise<{ success: boolean; error?: string; commitHash?: string }> =>
    ipcRenderer.invoke('complete-merge', projectPath, commitMessage),
  abortMerge: (projectPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('abort-merge', projectPath),
  getCommitGraph: (projectPath: string, depth?: number) => ipcRenderer.invoke('get-commit-graph', projectPath, depth),
  batchCheckMergeState: (projectPaths: string[]): Promise<Record<string, boolean>> =>
    ipcRenderer.invoke('batch-check-merge-state', projectPaths),

  // First-launch onboarding wizard
  wizardIsFirstLaunch: (): Promise<boolean> => ipcRenderer.invoke('wizard:is-first-launch'),
  wizardComplete: (config: Record<string, unknown>): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('wizard:complete', config),

  // Debug logging (only writes if --debug flag is set in main process)
  debugLog: (tag: string, message: string, data?: unknown) =>
    ipcRenderer.send('debug-log', tag, message, data),

  // App readiness signal — renderer calls this once React is mounted
  signalAppReady: () => ipcRenderer.send('renderer-app-ready'),

  // GPU status — check if HW acceleration was disabled due to prior crash
  getGpuStatus: (): Promise<{ hardwareAccelerationDisabled: boolean }> =>
    ipcRenderer.invoke('get-gpu-status'),
}

contextBridge.exposeInMainWorld('api', api)
