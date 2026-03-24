// U18 merge types — import for use in ElectronAPI, re-export for consumers
import type { ConflictChunk as _ConflictChunk, MergeState as _MergeState, CommitNode as _CommitNode } from './types/merge'
export type { ConflictStatus, ConflictChunk, ConflictFile, MergeState, CommitNode } from './types/merge'

export interface Choice {
  id: string
  label: string
  icon?: string
  description?: string
}

export interface Answer {
  value: string | string[]
  label: string
  /** True when this answer was pre-filled by folder detection (U3) */
  preDetected?: boolean
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

/** Structured detection result from existing folder files (U3) */
export interface FolderDetectionResult {
  techStack: string
  techStackLabel: string
  languages: string[]
  styling: string
  hasTypeScript: boolean
  hasPython: boolean
  framework: string
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
  /** Present when confident stack was detected from existing files */
  folderDetection?: FolderDetectionResult | null
}

export interface TerminalSession {
  id: string
  projectName: string
  projectPath: string
  /** X7: Per-terminal AI model override (null/undefined = use global default) */
  modelOverride?: string | null
}

export type ConfigLevel = 'bare' | 'claude-aware' | 'hal-o-enhanced'

export interface ProjectInfo {
  name: string
  path: string
  stack: string
  hasClaude: boolean
  hasBatchFiles: boolean
  hasClaudeDir: boolean
  hasHalOMeta: boolean
  configLevel: ConfigLevel
  lastModified: number
  gitOwner: string
  runCmd: string
  /** True when .hal-o-meta.json rulesVersion is below the current RULES_VERSION */
  rulesOutdated?: boolean
  /** Pre-baked stats for demo projects (bypasses IPC getProjectStats) */
  demoStats?: ProjectStats
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

// ── S5: Upgrade types ──

export interface UpgradeDiffLine {
  type: 'context' | 'added' | 'removed' | 'header'
  content: string
  lineNumber?: number
}

export interface UpgradeSection {
  id: string
  label: string
  relativePath: string
  currentContent: string
  newContent: string
  diffLines: UpgradeDiffLine[]
  hasChanges: boolean
  existsOnDisk: boolean
  hasUserCustomizations: boolean
  type: 'claude-md' | 'rule' | 'hooks' | 'meta'
}

export interface UpgradePreview {
  projectPath: string
  projectName: string
  currentVersion: number
  targetVersion: number
  currentAppVersion: string
  targetAppVersion: string
  sections: UpgradeSection[]
  changedCount: number
  hasExistingBackup: boolean
  changelog: string[]
}

export interface UpgradeResult {
  success: boolean
  log: string[]
  backupPath: string
  upgradedSections: string[]
  skippedSections: string[]
}

export interface RollbackResult {
  success: boolean
  log: string[]
  restoredFiles: string[]
}

export interface UpgradeBackupEntry {
  path: string
  timestamp: string
  rulesVersionBefore: number
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
  /** U2: modular feature picker additions */
  addRules?: string[]
  addDevlog?: string[]
  addMemorySeed?: boolean
  addAgentTemplates?: boolean
}

export interface EnlistResult {
  success: boolean
  log: string[]
  path: string
}

// ── X7: Model Provider types (mirrors main/model-providers.ts) ──

export type ProviderType = 'anthropic' | 'openai' | 'ollama' | 'custom'

export interface ModelEntry {
  id: string
  name: string
  modelId: string
  isDefault: boolean
}

export interface ModelProviderSerialized {
  id: string
  name: string
  type: ProviderType
  label: string
  baseUrl?: string
  available: boolean
  description: string
  models: ModelEntry[]
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
    communityTools: string[]
  }>
  enlistProject: (config: EnlistConfig) => Promise<EnlistResult>
  analyzeProject: (name: string, description: string, folderPath: string, lang?: string) => Promise<ProjectAnalysis>
  createProject: (config: Record<string, unknown>) => Promise<{ success: boolean; path?: string; log: string[] }>
  openFolder: (path: string) => Promise<void>
  runApp: (projectPath: string, runCmd: string) => Promise<void>
  openInClaude: (path: string) => Promise<void>
  // IDE (U19)
  openInIde: (path: string, ideId?: string) => Promise<{ success: boolean; ide?: string; error?: string }>
  resolveIde: (projectPath: string, perProjectIde?: string | null, globalDefault?: string | null) => Promise<{ id: string; name: string; shortLabel: string } | null>
  detectProjectIde: (projectPath: string) => Promise<string | null>
  getAvailableIdes: () => Promise<Array<{ id: string; name: string; shortLabel: string; available: boolean }>>
  openExternalTerminal: (projectPath: string) => Promise<{ success: boolean; error?: string }>

  // S5: Versioning upgrade system
  checkUpgradeAvailable: (projectPath: string) => Promise<{
    available: boolean; reason: string; currentVersion?: number; targetVersion?: number
    currentAppVersion?: string; targetAppVersion?: string; error?: string
  }>
  previewUpgrade: (projectPath: string) => Promise<{ success: boolean; preview?: UpgradePreview; error?: string }>
  applyUpgrade: (projectPath: string, acceptedSectionIds: string[]) => Promise<UpgradeResult>
  rollbackUpgrade: (projectPath: string, backupPath: string) => Promise<RollbackResult>
  listUpgradeBackups: (projectPath: string) => Promise<UpgradeBackupEntry[]>

  // Continuation (D4)
  writeContinuation: (data: { step: string; reason: string; message: string }) => Promise<{ success: boolean; error?: string }>
  readContinuation: () => Promise<{ step: string; reason: string; message: string } | null>

  // Statusline (D8)
  checkStatusline: () => Promise<{ exists: boolean; hasStatusline: boolean; settingsPath: string }>
  configureStatusline: () => Promise<{ success: boolean; path?: string; error?: string }>

  // Dev tools setup (D2)
  setupDevTools: (projectPath: string) => Promise<{ success: boolean; log: string[] }>
  writeDevToolsMeta: (projectPath: string, preference: 'later' | 'never') => Promise<{ success: boolean; error?: string }>

  // Session absorption
  detectExternalSessions: () => Promise<Array<{ pid: number; projectPath: string; projectName: string }>>
  absorbSession: (info: { pid: number; projectPath: string; projectName: string }) => Promise<{ success: boolean; error?: string }>

  // Model providers (X7)
  getAvailableModels: () => Promise<ModelProviderSerialized[]>
  setTerminalModel: (sessionId: string, modelId: string | null) => Promise<{ success: boolean }>
  getTerminalModel: (sessionId: string) => Promise<string | null>
  refreshModelProviders: () => Promise<ModelProviderSerialized[]>

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

  // System (X8: watchdog heartbeat)
  getLaunchOnStartup: () => Promise<boolean>
  setLaunchOnStartup: (enabled: boolean) => Promise<{ success: boolean; error?: string }>

  // Dev
  onToggle2dPreview: (callback: (enabled: boolean) => void) => () => void

  // Perf
  onWindowFocusChange: (callback: (focused: boolean) => void) => () => void

  // Clipboard
  copyToClipboard: (text: string) => Promise<boolean>

  // A11: "Ship it!" flyby on git push detection
  onShipItFlyby: (callback: (info: { projectPath: string; projectName: string; shipIndex: number }) => void) => () => void

  // M2: Cinematic demo mode
  onToggleCinematic: (callback: (enabled: boolean) => void) => () => void

  // U20: Terminal activity feedback — bytes/sec metering from PTY sessions
  onTerminalActivity: (callback: (info: { sessionId: string; projectPath: string; activityLevel: number }) => void) => () => void

  // U18: Merge conflict detection & resolution
  detectMergeConflicts: (projectPath: string) => Promise<_MergeState>
  checkMergeState: (projectPath: string) => Promise<boolean>
  parseConflictFile: (projectPath: string, filePath: string) => Promise<_ConflictChunk[]>
  resolveConflictChunk: (projectPath: string, filePath: string, chunkId: number, resolution: string, customContent?: string) => Promise<{ success: boolean; error?: string }>
  resolveConflictFile: (projectPath: string, filePath: string, resolutions: Array<{ chunkId: number; resolution: string; customContent?: string }>) => Promise<{ success: boolean; error?: string }>
  completeMerge: (projectPath: string, commitMessage?: string) => Promise<{ success: boolean; error?: string; commitHash?: string }>
  abortMerge: (projectPath: string) => Promise<{ success: boolean; error?: string }>
  getCommitGraph: (projectPath: string, depth?: number) => Promise<_CommitNode[]>
  batchCheckMergeState: (projectPaths: string[]) => Promise<Record<string, boolean>>
}

declare global {
  interface Window {
    api: ElectronAPI
    __halOMuted?: boolean
  }
}
