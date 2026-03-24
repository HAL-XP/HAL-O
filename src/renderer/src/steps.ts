import { StepDef, Phase, Answers } from './types'
import { STACK_PROFILES, getSmartDefaults, getProfile } from './stack-profiles'

export const PHASES: Phase[] = [
  { id: 'basics', label: 'Basics', icon: '1' },
  { id: 'stack', label: 'Stack', icon: '2' },
  { id: 'github', label: 'GitHub', icon: '3' },
  { id: 'claude', label: 'Claude', icon: '4' },
  { id: 'extras', label: 'Extras', icon: '5' },
]

/** Returns true when the user chose Quick Create mode (W5) */
export function isQuickCreate(answers: Answers): boolean {
  return answers['wizard-mode']?.value === 'quick'
}

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
  // ── Phase: Basics — Wizard mode selector (W5) ──
  {
    id: 'wizard-mode',
    phase: 'basics',
    question: 'How would you like to set up your project?',
    type: 'choice',
    choices: [
      {
        id: 'quick',
        label: 'QUICK SETUP (recommended)',
        icon: '⚡',
        description: 'Name it, we detect the stack, apply balanced defaults, done in seconds',
      },
      {
        id: 'full',
        label: 'Full wizard',
        icon: '☰',
        description: '5-phase guided setup — stack, GitHub, Claude, extras',
      },
    ],
  },
  // ── Phase: Basics ──
  {
    id: 'project-name',
    phase: 'basics',
    question: "What's the name of your new project?",
    type: 'text',
    placeholder: 'MyAwesomeProject',
    validate: (v) => {
      if (!v.trim()) return 'Project name is required'
      if (v.length > 50) return `Name too long (${v.length}/50 chars)`
      if (/[^a-zA-Z0-9_-]/.test(v)) return 'Use only letters, numbers, hyphens, underscores (no spaces)'
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
    validate: (v) => {
      if (v.length > 500) return `Description too long (${v.length}/500 chars)`
      return null
    },
  },

  // ── Phase: Stack (LLM-analyzed) ──
  {
    id: 'stack-analysis',
    phase: 'stack',
    question: 'Let me analyze your project... *(uses ~1 API call)*',
    type: 'analysis' as StepType,
  },
  // Fallback manual steps (only shown if user clicks "Let me adjust" or analysis fails)
  {
    id: 'tech-stack',
    phase: 'stack',
    question: "What's the primary tech stack?",
    type: 'choice',
    condition: (a) => a['stack-analysis']?.value === '__manual__',
    choices: STACK_PROFILES.map((p) => ({
      id: p.id,
      label: p.label,
      icon: p.icon,
      description: p.category,
    })),
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
    // Skip in quick-create mode (W5)
    condition: (a) => !isQuickCreate(a),
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
    condition: (a) => !isQuickCreate(a) && a['github-create']?.value === 'yes',
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
    condition: (a) => !isQuickCreate(a) && a['github-create']?.value === 'yes',
    choices: [
      { id: 'private', label: 'Private' },
      { id: 'public', label: 'Public' },
    ],
  },

  // ── Phase: Claude ──
  {
    id: 'claude-md',
    phase: 'claude',
    question: 'Set up **CLAUDE.md** with best practices from your tips repo? *(zero token cost)*',
    type: 'choice',
    // Skip in quick-create mode — defaults to 'full' (W5)
    condition: (a) => !isQuickCreate(a),
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
      return `Which **hooks** should I configure? *(zero token cost)*${extra}`
    },
    type: 'multi-select',
    // Skip in quick-create mode — smart defaults applied automatically (W5)
    condition: (a) => !isQuickCreate(a),
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
      choices.push({ id: 'telegram-notify', label: 'Telegram notifications', description: 'Permission prompts + idle updates via Telegram bot' })
      return choices
    },
    defaultValue: (answers) => {
      const stack = answers['tech-stack']?.value as string || ''
      const langs = answers['languages']?.value
      const langArr = Array.isArray(langs) ? langs : []
      return getSmartDefaults(stack, langArr).hooks
    },
    allowSkip: true,
  },
  {
    id: 'rules-setup',
    phase: 'claude',
    question: 'Which **.claude/rules/** files should I create? *(zero token cost)*',
    type: 'multi-select',
    // Skip in quick-create mode — smart defaults applied automatically (W5)
    condition: (a) => !isQuickCreate(a),
    choices: (answers) => {
      const choices: { id: string; label: string; description?: string }[] = []
      if (hasFrontend(answers)) {
        choices.push({ id: 'frontend', label: 'frontend.md', description: 'Component patterns, styling rules' })
        choices.push({ id: 'ux', label: 'ux.md', description: 'UX principles, state-driven UI' })
      }
      if (hasPython(answers)) {
        choices.push({ id: 'python-api', label: 'python-api.md', description: 'FastAPI routes, restart protocol' })
      }
      const stack = answers['tech-stack']?.value as string || ''
      if (/node|express|nestjs/i.test(stack) || ['fullstack-node', 'node-backend'].includes(stack)) {
        choices.push({ id: 'node-api', label: 'node-api.md', description: 'Express/Node routes, conventions' })
      }
      if (/go/i.test(stack) || stack === 'go-backend') {
        choices.push({ id: 'go-api', label: 'go-api.md', description: 'Go API conventions' })
      }
      if (/rust|axum|actix/i.test(stack) || stack === 'rust-backend') {
        choices.push({ id: 'rust-api', label: 'rust-api.md', description: 'Rust API conventions' })
      }
      if (/game|pygame|godot/i.test(stack)) {
        choices.push({ id: 'game-loop', label: 'game-loop.md', description: 'Game loop, sprites, assets' })
      }
      if (/data|ml|jupyter|pandas/i.test(stack)) {
        choices.push({ id: 'data-pipeline', label: 'data-pipeline.md', description: 'Data pipeline conventions' })
      }
      if (/mobile|react-native|expo/i.test(stack)) {
        choices.push({ id: 'mobile', label: 'mobile.md', description: 'Mobile app conventions' })
      }
      if (hasFrontend(answers) || /three|3d|game|canvas|webgl/i.test(stack)) {
        choices.push({ id: 'profiling', label: 'profiling.md', description: 'Performance profiling guidelines and baseline protocol' })
      }
      choices.push({ id: 'banned-techniques', label: 'banned-techniques.md', description: 'Dead ends log — never retry these' })
      return choices
    },
    defaultValue: (answers) => {
      const stack = answers['tech-stack']?.value as string || ''
      const langs = answers['languages']?.value
      const langArr = Array.isArray(langs) ? langs : []
      return getSmartDefaults(stack, langArr).rules
    },
    allowSkip: true,
  },
  {
    id: 'devlog',
    phase: 'claude',
    question: 'Set up **`_devlog/`** folder? *(zero token cost)*\n\nA top-level folder for daily summaries, hours tracking, architecture decisions, and experiment logs.',
    type: 'multi-select',
    choices: [
      { id: 'summaries', label: 'summaries/', description: 'Daily session summaries (summary_YYYYMMDD.md)' },
      { id: 'hours', label: 'hours/', description: 'Human-equivalent hours tracking (hours_YYYYMMDD.md)' },
      { id: 'decisions', label: 'decisions/', description: 'Architecture decision records' },
      { id: 'experiments', label: 'experiments/', description: 'Trial/spike results before adopt or kill' },
      { id: 'perf', label: 'perf/', description: 'Performance baselines — FPS, draw calls, GPU ms (perf_YYYYMMDD.md)' },
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
    // Skip in quick-create mode — smart defaults applied automatically (W5)
    condition: (a) => !isQuickCreate(a),
    choices: (answers) => {
      const stack = answers['tech-stack']?.value as string || ''
      const profile = getProfile(stack)
      const choices = [
        { id: 'memory-seed', label: 'MEMORY.md seed', description: 'Initial memory template' },
        { id: 'readme', label: 'README.md', description: 'From project info' },
        { id: 'skip-permissions', label: 'Skip permissions', description: '--dangerously-skip-permissions in launch scripts' },
      ]
      // Playwright only for frontend stacks
      if (profile?.playwright || hasFrontend(answers)) {
        choices.unshift({ id: 'playwright-mcp', label: 'Playwright MCP', description: '.mcp.json for browser testing' })
      }
      // Agent templates for complex stacks
      if (profile?.agentTypes?.length || hasFrontend(answers) || hasPython(answers)) {
        choices.splice(choices.length - 1, 0, { id: 'agent-templates', label: 'Agent templates', description: 'Starter .claude/agents/ files' })
      }
      // Frontend design plugin for stacks with UI
      if (profile?.playwright || hasFrontend(answers)) {
        choices.push({ id: 'plugin-frontend-design', label: 'Frontend Design plugin', description: 'Anthropic plugin for distinctive, non-generic UI styling' })
      }
      // Cloud suggestions from profile
      if (profile?.cloudSuggestions?.length) {
        for (const cloud of profile.cloudSuggestions) {
          const labels: Record<string, { label: string; desc: string }> = {
            vercel: { label: 'Vercel deploy', desc: 'Deploy conventions for Vercel' },
            cloudflare: { label: 'Cloudflare', desc: 'Workers, Pages, R2 conventions' },
            gcp: { label: 'Google Cloud (GCP)', desc: 'GCP conventions + MCP server' },
            aws: { label: 'AWS', desc: 'S3, Lambda conventions' },
            supabase: { label: 'Supabase', desc: 'BaaS setup + conventions' },
            docker: { label: 'Docker', desc: 'Dockerfile + .dockerignore template' },
            railway: { label: 'Railway', desc: 'Deploy conventions' },
            'fly-io': { label: 'Fly.io', desc: 'fly.toml + deploy conventions' },
          }
          const info = labels[cloud]
          if (info) {
            choices.push({ id: `cloud-${cloud}`, label: info.label, description: info.desc })
          }
        }
      }
      return choices
    },
    defaultValue: (answers) => {
      const stack = answers['tech-stack']?.value as string || ''
      const langs = answers['languages']?.value
      const langArr = Array.isArray(langs) ? langs : []
      return getSmartDefaults(stack, langArr).extras
    },
  },

  // ── Phase: Extras — Token Budget (U21) ──
  {
    id: 'token-budget',
    phase: 'extras',
    question: (answers) => {
      const subType = answers['_subscription_type']?.value as string
      const hint = subType === 'subscription'
        ? '\n\nDetected: **subscription** (unlimited) — Full is recommended.'
        : subType === 'api'
          ? '\n\nDetected: **API** (pay per token) — Balanced saves ~30%.'
          : ''
      return `Choose a **token budget** strategy. This affects CLAUDE.md size, compaction thresholds, and subagent model selection.${hint}`
    },
    type: 'choice',
    // Skip in quick-create mode — defaults to 'full' (W5)
    condition: (a) => !isQuickCreate(a),
    choices: [
      {
        id: 'full',
        label: 'Full features',
        icon: '⚡',
        description: 'All features enabled, no optimization — best for subscription users',
      },
      {
        id: 'balanced',
        label: 'Balanced',
        icon: '⚖',
        description: 'Haiku subagents, compaction at 75%, full CLAUDE.md — ~30% savings',
      },
      {
        id: 'aggressive',
        label: 'Aggressive saver',
        icon: '💰',
        description: 'Haiku subagents, compaction at 65%, minimal CLAUDE.md — ~50% savings',
      },
    ],
    defaultValue: (answers) => {
      const subType = answers['_subscription_type']?.value as string
      return subType === 'api' ? 'balanced' : 'full'
    },
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
