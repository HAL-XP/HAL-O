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

export interface ProjectInfo {
  name: string
  path: string
  stack: string
  hasClaude: boolean
  hasBatchFiles: boolean
  hasClaudeDir: boolean
  lastModified: number
}

export interface PrerequisiteStatus {
  nodeVersion: string
  ghInstalled: boolean
  ghAuthenticated: boolean
  ghUser: string
  apiKeyFound: boolean
  apiKeySource: string
  apiKeyPreview: string
}

export interface ElectronAPI {
  // Setup
  getPlatform: () => Promise<string>
  getGhInstallLabel: () => Promise<string>
  checkPrerequisites: () => Promise<PrerequisiteStatus>
  saveApiKey: (key: string, location: string) => Promise<{ success: boolean; path?: string; error?: string }>
  installGhCli: () => Promise<{ success: boolean; error?: string }>
  authGhCli: () => Promise<{ success: boolean }>

  // Hub
  scanProjects: () => Promise<ProjectInfo[]>
  launchProject: (path: string, resume: boolean) => Promise<void>

  // Wizard
  getDefaultProjectPath: () => Promise<string>
  selectFolder: (defaultPath?: string) => Promise<string | null>
  getGitHubUser: () => Promise<string>
  getGitHubOrgs: () => Promise<string[]>
  analyzeProject: (name: string, description: string, folderPath: string, lang?: string) => Promise<ProjectAnalysis>
  createProject: (config: Record<string, unknown>) => Promise<{ success: boolean; path?: string; log: string[] }>
  openFolder: (path: string) => Promise<void>
  openInClaude: (path: string) => Promise<void>
}

declare global {
  interface Window {
    api: ElectronAPI
    __claudebornMuted?: boolean
  }
}
