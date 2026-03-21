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
  analyzeProject: (name: string, description: string, folderPath: string, lang?: string) => ipcRenderer.invoke('analyze-project', name, description, folderPath, lang),
  createProject: (config: Record<string, unknown>) => ipcRenderer.invoke('create-project', config),
  openFolder: (path: string) => ipcRenderer.invoke('open-folder', path),
  openInClaude: (path: string) => ipcRenderer.invoke('open-in-claude', path),
}

contextBridge.exposeInMainWorld('api', api)
