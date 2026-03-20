import { StepDef, Phase, Answers } from './types'

export const PHASES: Phase[] = [
  { id: 'basics', label: 'Basics', icon: '1' },
  { id: 'stack', label: 'Stack', icon: '2' },
  { id: 'github', label: 'GitHub', icon: '3' },
  { id: 'claude', label: 'Claude', icon: '4' },
  { id: 'extras', label: 'Extras', icon: '5' },
]

function hasFrontend(answers: Answers): boolean {
  const stack = answers['tech-stack']?.value as string || ''
  const label = answers['tech-stack']?.label?.toLowerCase() || ''
  if (['web-react', 'fullstack-node', 'fullstack-python', 'electron'].includes(stack)) return true
  // LLM may return custom stack IDs — check label for frontend keywords
  return /react|vue|svelte|next|nuxt|angular|frontend|vite/.test(label) || /react|vue|svelte|next|nuxt|angular|frontend/.test(stack)
}

function hasPython(answers: Answers): boolean {
  const stack = answers['tech-stack']?.value as string || ''
  const label = answers['tech-stack']?.label?.toLowerCase() || ''
  const langs = answers['languages']?.value
  if (['python-backend', 'fullstack-python'].includes(stack)) return true
  if (Array.isArray(langs) && langs.includes('python')) return true
  return /python|fastapi|django|flask/.test(label) || /python|fastapi|django|flask/.test(stack)
}

function hasTypeScript(answers: Answers): boolean {
  const langs = answers['languages']?.value
  if (Array.isArray(langs)) return langs.some(l => /typescript/i.test(l))
  return hasFrontend(answers)
}

export const STEPS: StepDef[] = [
  // ── Phase: Basics ──
  {
    id: 'project-name',
    phase: 'basics',
    question: "What's the name of your new project?",
    type: 'text',
    placeholder: 'MyAwesomeProject',
    validate: (v) => {
      if (!v.trim()) return 'Project name is required'
      if (/[^a-zA-Z0-9_-]/.test(v)) return 'Use only letters, numbers, hyphens, underscores'
      return null
    },
  },
  {
    id: 'project-location',
    phase: 'basics',
    question: (answers) => {
      const name = answers['project-name']?.value || 'YourProject'
      return `Where should **${name}** live?`
    },
    type: 'folder',
    defaultValue: (answers) => answers['_default_path']?.value as string || '',
    choices: (answers) => {
      const detected = answers['_default_path']?.value as string
      const choices: { id: string; label: string }[] = []
      if (detected) choices.push({ id: detected, label: detected })
      choices.push({ id: '__browse__', label: 'Browse...' })
      return choices
    },
    allowOther: true,
  },
  {
    id: 'project-description',
    phase: 'basics',
    question: 'Describe your project in a sentence or two.',
    type: 'textarea',
    placeholder: 'A task management app with real-time collaboration and notifications...',
    allowSkip: true,
    skipLabel: 'Skip for now',
  },

  // ── Phase: Stack (LLM-analyzed) ──
  {
    id: 'stack-analysis',
    phase: 'stack',
    question: 'Let me analyze your project...',
    type: 'analysis' as StepType,
  },
  // Fallback manual steps (only shown if user clicks "Let me adjust" or analysis fails)
  {
    id: 'tech-stack',
    phase: 'stack',
    question: "What's the primary tech stack?",
    type: 'choice',
    condition: (a) => a['stack-analysis']?.value === '__manual__',
    choices: [
      { id: 'web-react', label: 'Web App (React + Vite)', icon: 'R' },
      { id: 'fullstack-node', label: 'Full Stack (React + Node)', icon: 'FN' },
      { id: 'fullstack-python', label: 'Full Stack (React + Python)', icon: 'FP' },
      { id: 'electron', label: 'Electron App', icon: 'E' },
      { id: 'python-backend', label: 'Python Backend', icon: 'Py' },
      { id: 'node-backend', label: 'Node.js Backend', icon: 'N' },
      { id: 'cli-tool', label: 'CLI Tool', icon: 'CLI' },
    ],
    allowOther: true,
  },
  {
    id: 'languages',
    phase: 'stack',
    question: 'Which language(s) will you use?',
    type: 'multi-select',
    condition: (a) => a['stack-analysis']?.value === '__manual__',
    choices: () => [
      { id: 'typescript', label: 'TypeScript' },
      { id: 'javascript', label: 'JavaScript' },
      { id: 'python', label: 'Python' },
      { id: 'csharp', label: 'C#' },
      { id: 'cpp', label: 'C++' },
      { id: 'rust', label: 'Rust' },
      { id: 'go', label: 'Go' },
    ],
    allowOther: true,
  },
  {
    id: 'styling',
    phase: 'stack',
    question: 'Styling approach?',
    type: 'choice',
    condition: (a) => a['stack-analysis']?.value === '__manual__' && hasFrontend(a),
    choices: [
      { id: 'tailwind', label: 'Tailwind CSS' },
      { id: 'css-modules', label: 'CSS Modules' },
      { id: 'styled-components', label: 'styled-components' },
      { id: 'plain-css', label: 'Plain CSS' },
    ],
    allowOther: true,
    allowSkip: true,
  },
  {
    id: 'database',
    phase: 'stack',
    question: 'Database?',
    type: 'choice',
    condition: (a) => a['stack-analysis']?.value === '__manual__',
    choices: [
      { id: 'postgresql', label: 'PostgreSQL' },
      { id: 'sqlite', label: 'SQLite' },
      { id: 'mongodb', label: 'MongoDB' },
      { id: 'json-files', label: 'JSON files' },
      { id: 'none', label: 'None' },
    ],
    allowOther: true,
    allowSkip: true,
  },

  // ── Phase: GitHub ──
  {
    id: 'github-create',
    phase: 'github',
    question: 'Create a GitHub repository?',
    type: 'choice',
    choices: [
      { id: 'yes', label: 'Yes, create now', description: 'Creates repo on GitHub via gh CLI' },
      { id: 'no', label: 'No, just git init locally', description: 'Initialize git locally, push later' },
    ],
  },
  {
    id: 'github-account',
    phase: 'github',
    question: 'Under which account?',
    type: 'choice',
    condition: (a) => a['github-create']?.value === 'yes',
    choices: (answers) => {
      // Populated dynamically from _gh_user and _gh_orgs injected at app start
      const user = answers['_gh_user']?.value as string || ''
      const orgs = answers['_gh_orgs']?.value
      const orgList = Array.isArray(orgs) ? orgs : []
      const choices: { id: string; label: string }[] = []
      if (user) choices.push({ id: user, label: `${user} (personal)` })
      for (const org of orgList) {
        choices.push({ id: org, label: org })
      }
      if (choices.length === 0) choices.push({ id: 'personal', label: 'Personal account' })
      return choices
    },
    allowOther: true,
  },
  {
    id: 'github-visibility',
    phase: 'github',
    question: 'Repository visibility?',
    type: 'choice',
    condition: (a) => a['github-create']?.value === 'yes',
    choices: [
      { id: 'private', label: 'Private' },
      { id: 'public', label: 'Public' },
    ],
  },

  // ── Phase: Claude ──
  {
    id: 'claude-md',
    phase: 'claude',
    question: 'Set up **CLAUDE.md** with best practices from your tips repo?',
    type: 'choice',
    choices: [
      { id: 'full', label: 'Yes, full setup', description: 'Session protocol, conventions, what NOT to do' },
      { id: 'minimal', label: 'Minimal', description: 'Just project overview + stack' },
      { id: 'skip', label: 'Skip' },
    ],
  },
  {
    id: 'hooks-setup',
    phase: 'claude',
    question: (answers) => {
      const parts: string[] = []
      if (hasTypeScript(answers)) parts.push('TypeScript type-check after edits')
      if (hasPython(answers)) parts.push('pycache clearing after Python edits')
      const extra = parts.length ? `\n\nBased on your stack, I can also add: ${parts.join(', ')}` : ''
      return `Which **hooks** should I configure?${extra}`
    },
    type: 'multi-select',
    choices: (answers) => {
      const choices = [
        { id: 'session-start', label: 'SessionStart health check', description: 'Git status + ACTION line on startup' },
      ]
      if (hasTypeScript(answers)) {
        choices.push({ id: 'post-tool-tsc', label: 'PostToolUse: tsc auto-check', description: 'Type-check after .ts/.tsx edits' })
      }
      if (hasPython(answers)) {
        choices.push({ id: 'post-tool-pycache', label: 'PostToolUse: pycache clear', description: 'Clear __pycache__ after .py edits' })
      }
      return choices
    },
    defaultValue: (answers) => {
      const defaults = ['session-start']
      if (hasTypeScript(answers)) defaults.push('post-tool-tsc')
      if (hasPython(answers)) defaults.push('post-tool-pycache')
      return defaults
    },
    allowSkip: true,
  },
  {
    id: 'rules-setup',
    phase: 'claude',
    question: 'Which **.claude/rules/** files should I create?',
    type: 'multi-select',
    choices: (answers) => {
      const choices: { id: string; label: string; description?: string }[] = []
      if (hasFrontend(answers)) {
        choices.push({ id: 'frontend', label: 'frontend.md', description: 'Component patterns, styling rules' })
        choices.push({ id: 'ux', label: 'ux.md', description: 'UX principles, state-driven UI' })
      }
      if (hasPython(answers)) {
        choices.push({ id: 'python-api', label: 'python-api.md', description: 'FastAPI routes, restart protocol' })
      }
      const stack = answers['tech-stack']?.value as string
      if (['fullstack-node', 'node-backend'].includes(stack)) {
        choices.push({ id: 'node-api', label: 'node-api.md', description: 'Express/Node routes, conventions' })
      }
      choices.push({ id: 'banned-techniques', label: 'banned-techniques.md', description: 'Dead ends log — never retry these' })
      return choices
    },
    defaultValue: (answers) => {
      const defaults: string[] = []
      if (hasFrontend(answers)) { defaults.push('frontend', 'ux') }
      if (hasPython(answers)) defaults.push('python-api')
      const stack = answers['tech-stack']?.value as string
      if (['fullstack-node', 'node-backend'].includes(stack)) defaults.push('node-api')
      defaults.push('banned-techniques')
      return defaults
    },
    allowSkip: true,
  },
  {
    id: 'devlog',
    phase: 'claude',
    question: 'Set up **`_devlog/`** folder?\n\nA top-level folder for daily summaries, hours tracking, architecture decisions, and experiment logs.',
    type: 'multi-select',
    choices: [
      { id: 'summaries', label: 'summaries/', description: 'Daily session summaries (summary_YYYYMMDD.md)' },
      { id: 'hours', label: 'hours/', description: 'Human-equivalent hours tracking (hours_YYYYMMDD.md)' },
      { id: 'decisions', label: 'decisions/', description: 'Architecture decision records' },
      { id: 'experiments', label: 'experiments/', description: 'Trial/spike results before adopt or kill' },
    ],
    defaultValue: ['summaries', 'hours', 'decisions', 'experiments'],
    allowSkip: true,
    skipLabel: 'No devlog',
  },

  // ── Phase: Extras ──
  {
    id: 'extras',
    phase: 'extras',
    question: 'Which extras should I set up?',
    type: 'multi-select',
    choices: (answers) => {
      const choices = [
        { id: 'playwright-mcp', label: 'Playwright MCP', description: '.mcp.json for browser testing' },
        { id: 'memory-seed', label: 'MEMORY.md seed', description: 'Initial memory template' },
        { id: 'readme', label: 'README.md', description: 'From project info' },
        { id: 'skip-permissions', label: 'Skip permissions', description: 'Use --dangerously-skip-permissions in batch files (no confirmation prompts)' },
      ]
      if (hasFrontend(answers) || hasPython(answers)) {
        choices.splice(2, 0, { id: 'agent-templates', label: 'Agent templates', description: 'Starter .claude/agents/ files' })
      }
      return choices
    },
    defaultValue: ['playwright-mcp', 'agent-templates', 'memory-seed', 'readme', 'skip-permissions'],
  },

  // Launch phase removed — agent name auto-derived from project name, session name always on
]

export function getActiveSteps(answers: Answers): StepDef[] {
  return STEPS.filter((step) => !step.condition || step.condition(answers))
}

export function getPhaseForStep(stepId: string): string {
  const step = STEPS.find((s) => s.id === stepId)
  return step?.phase || 'basics'
}
