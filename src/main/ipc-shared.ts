import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'

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

export function run(cmd: string, cwd?: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch (e: any) {
    throw new Error(e.stderr || e.message)
  }
}

export function findApiKey(): { key: string; source: string } {
  // 1. Check environment variable directly
  if (process.env.ANTHROPIC_API_KEY) {
    return { key: process.env.ANTHROPIC_API_KEY, source: 'Environment variable' }
  }

  const home = process.env.HOME || process.env.USERPROFILE || ''

  // 2. Try sourcing ~/.claude_credentials (bash format: export VAR="val")
  try {
    const credPath = join(home, '.claude_credentials')
    const content = readFileSync(credPath, 'utf-8')
    const match = content.match(/(?:export\s+)?ANTHROPIC_API_KEY\s*=\s*"?([^"\s\n]+)"?/)
    if (match) return { key: match[1], source: '~/.claude_credentials' }
  } catch { /* */ }

  // 3. Check .env files in various locations
  const envFiles = [
    { path: join(process.cwd(), '.env'), label: '.env (project)' },
    { path: join(process.cwd(), '.env.local'), label: '.env.local (project)' },
    { path: join(home, '.env'), label: '~/.env' },
    { path: join(home, '.env.local'), label: '~/.env.local' },
  ]

  for (const c of envFiles) {
    try {
      const content = readFileSync(c.path, 'utf-8')
      const match = content.match(/(?:export\s+)?ANTHROPIC_API_KEY\s*=\s*"?([^"\s\n]+)"?/)
      if (match) return { key: match[1], source: c.label }
    } catch { /* skip */ }
  }

  // 4. Check Anthropic config locations
  const configPaths = [
    { path: join(home, '.anthropic', 'api_key'), label: '~/.anthropic/api_key' },
    { path: join(home, '.config', 'anthropic', 'api_key'), label: '~/.config/anthropic/api_key' },
  ]

  for (const c of configPaths) {
    try {
      const key = readFileSync(c.path, 'utf-8').trim()
      if (key && key.startsWith('sk-')) return { key, source: c.label }
    } catch { /* skip */ }
  }

  // 5. Try to get it from Claude CLI config (if claude is installed)
  try {
    const result = run('claude config get api_key 2>/dev/null || true')
    if (result && result.startsWith('sk-')) return { key: result, source: 'Claude CLI config' }
  } catch { /* */ }

  return { key: '', source: '' }
}
