import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Setup
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  getGhInstallLabel: () => ipcRenderer.invoke('get-gh-install-label'),
  checkPrerequisites: () => ipcRenderer.invoke('check-prerequisites'),
  saveApiKey: (key: string, location: string) => ipcRenderer.invoke('save-api-key', key, location),
  installGhCli: () => ipcRenderer.invoke('install-gh-cli'),
  authGhCli: () => ipcRenderer.invoke('auth-gh-cli'),

  // Hub
  scanProjects: () => ipcRenderer.invoke('scan-projects'),
  launchProject: (path: string, resume: boolean) => ipcRenderer.invoke('launch-project', path, resume),
  getLaunchArgs: () => ipcRenderer.invoke('get-launch-args'),

  // Wizard
  getDefaultProjectPath: () => ipcRenderer.invoke('get-default-project-path'),
  selectFolder: (defaultPath?: string) => ipcRenderer.invoke('select-folder', defaultPath),
  getGitHubUser: () => ipcRenderer.invoke('get-github-user'),
  getGitHubOrgs: () => ipcRenderer.invoke('get-github-orgs'),
  scanExistingProject: (projectPath: string) => ipcRenderer.invoke('scan-existing-project', projectPath),
  analyzeProject: (name: string, description: string, folderPath: string, lang?: string) => ipcRenderer.invoke('analyze-project', name, description, folderPath, lang),
  createProject: (config: Record<string, unknown>) => ipcRenderer.invoke('create-project', config),
  openFolder: (path: string) => ipcRenderer.invoke('open-folder', path),
  runApp: (projectPath: string, runCmd: string) => ipcRenderer.invoke('run-app', projectPath, runCmd),
  openInClaude: (path: string) => ipcRenderer.invoke('open-in-claude', path),

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
}

contextBridge.exposeInMainWorld('api', api)
