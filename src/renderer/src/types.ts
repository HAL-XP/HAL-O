export interface Choice {
  id: string
  label: string
  icon?: string
  description?: string
}

export interface Answer {
  value: string | string[]
  label: string
}

export type StepType = 'choice' | 'text' | 'textarea' | 'folder' | 'multi-select' | 'analysis'

export interface StepDef {
  id: string
  phase: string
  question: string | ((answers: Answers) => string)
  type: StepType
  choices?: Choice[] | ((answers: Answers) => Choice[])
  allowOther?: boolean
  allowSkip?: boolean
  skipLabel?: string
  defaultValue?: string | string[] | ((answers: Answers) => string | string[])
  condition?: (answers: Answers) => boolean
  placeholder?: string
  validate?: (value: string) => string | null
}

export type Answers = Record<string, Answer>

export interface Phase {
  id: string
  label: string
  icon: string
}

export interface WizardState {
  currentStepIndex: number
  answers: Answers
  isCreating: boolean
  creationLog: string[]
  creationDone: boolean
  createdPath: string | null
}

export interface ProjectConfig {
  name: string
  location: string
  description: string
  techStack: string
  languages: string[]
  styling: string
  database: string
  githubCreate: boolean
  githubAccount: string
  githubVisibility: string
  claudeMd: string
  hooksSetup: string[]
  rulesSetup: string[]
  devlog: string[]
  gitignore: boolean
  playwrightMcp: boolean
  frontendDesignPlugin: boolean
  agentTemplates: boolean
  memorySeed: boolean
  readme: boolean
  agentName: string
  sessionName: boolean
  conventions: string[]
  skipPermissions: boolean
}

export interface ProjectAnalysis {
  techStack: string
  techStackLabel: string
  languages: string[]
  styling: string
  database: string
  agentName: string
  conventions: string[]
  reasoning: string
  folderDetected: boolean
}

export interface TerminalSession {
  id: string
  projectName: string
  projectPath: string
}

export interface ProjectInfo {
  name: string
  path: string
  stack: string
  hasClaude: boolean
  hasBatchFiles: boolean
  hasClaudeDir: boolean
  lastModified: number
  gitOwner: string
  runCmd: string
}

export interface PrerequisiteStatus {
  nodeVersion: string
  gitInstalled: boolean
  gitVersion: string
  ghInstalled: boolean
  ghAuthenticated: boolean
  ghUser: string
  pythonInstalled: boolean
  pythonVersion: string
  claudeCliInstalled: boolean
  claudeCliVersion: string
  ffmpegInstalled: boolean
  apiKeyFound: boolean
  apiKeySource: string
  apiKeyPreview: string
}

export interface InstallLabels {
  git: string
  gh: string
  python: string
  claudeCli: string
  ffmpeg: string
}

export interface ProjectStats {
  lastCommit: string
  lastCommitTime: number
  commitCount30d: number
  fileCount: number
}

export interface EnlistConfig {
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
}

export interface EnlistResult {
  success: boolean
  log: string[]
  path: string
}

export interface ElectronAPI {
  // Setup
  getPlatform: () => Promise<string>
  getGhInstallLabel: () => Promise<string>
  getInstallLabels: () => Promise<InstallLabels>
  checkPrerequisites: () => Promise<PrerequisiteStatus>
  saveApiKey: (key: string, location: string) => Promise<{ success: boolean; path?: string; error?: string }>
  installGit: () => Promise<{ success: boolean; error?: string }>
  installGhCli: () => Promise<{ success: boolean; error?: string }>
  installPython: () => Promise<{ success: boolean; needsRestart?: boolean; error?: string }>
  installClaudeCli: () => Promise<{ success: boolean; error?: string }>
  installFfmpeg: () => Promise<{ success: boolean; error?: string }>
  authGhCli: () => Promise<{ success: boolean }>

  // Hub
  scanProjects: () => Promise<ProjectInfo[]>
  launchProject: (path: string, resume: boolean) => Promise<void>
  getProjectStats: (path: string) => Promise<ProjectStats>

  // Wizard
  getDefaultProjectPath: () => Promise<string>
  selectFolder: (defaultPath?: string) => Promise<string | null>
  getGitHubUser: () => Promise<string>
  getGitHubOrgs: () => Promise<string[]>
  scanExistingProject: (projectPath: string) => Promise<{
    name: string; path: string; hasGit: boolean; gitRemote: string; gitBranch: string
    hasClaude: boolean; hasClaudeDir: boolean; hasBatchFiles: boolean
    hasHooks: boolean; hasRules: boolean; hasDevlog: boolean
    rulesList: string[]; languages: string[]
    halOMeta: { enlistedAt: string; halOVersion: string; rulesVersion: number } | null
    stack: string; description: string; files: string[]; readme: string
  }>
  enlistProject: (config: EnlistConfig) => Promise<EnlistResult>
  analyzeProject: (name: string, description: string, folderPath: string, lang?: string) => Promise<ProjectAnalysis>
  createProject: (config: Record<string, unknown>) => Promise<{ success: boolean; path?: string; log: string[] }>
  openFolder: (path: string) => Promise<void>
  runApp: (projectPath: string, runCmd: string) => Promise<void>
  openInClaude: (path: string) => Promise<void>

  // Session absorption
  detectExternalSessions: () => Promise<Array<{ pid: number; projectPath: string; projectName: string }>>
  absorbSession: (info: { pid: number; projectPath: string; projectName: string }) => Promise<{ success: boolean }>

  // Terminal (pty)
  ptySpawn: (options: {
    id: string; cwd: string; cmd: string; args: string[]
    cols: number; rows: number; projectName: string
  }) => Promise<{ success: boolean }>
  ptyInput: (id: string, data: string) => Promise<void>
  ptyResize: (id: string, cols: number, rows: number) => Promise<void>
  ptyClose: (id: string) => Promise<void>
  ptySessions: () => Promise<Array<{ id: string; projectName: string; projectPath: string }>>
  onPtyData: (id: string, callback: (data: string) => void) => () => void
  onPtyExit: (id: string, callback: (info: { code: number }) => void) => () => void

  ptyPopExternal: (sessionId: string) => Promise<boolean>
  ptyPreRestart: () => Promise<number>
  ptyCheckPending: () => Promise<Array<{ projectPath: string; projectName: string }>>

  // Voice
  voiceTranscribe: (audioBuffer: ArrayBuffer) => Promise<{ success: boolean; text: string; error?: string }>
  voiceSpeak: (text: string, profile?: string, lang?: string) => Promise<{ success: boolean; audioPath?: string; audioDataUrl?: string; error?: string }>
}

declare global {
  interface Window {
    api: ElectronAPI
    __halOMuted?: boolean
  }
}
