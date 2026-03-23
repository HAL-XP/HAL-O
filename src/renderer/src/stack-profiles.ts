// Stack profiles: curated defaults for solo developers
// Each profile maps a tech stack to recommended hooks, rules, extras, cloud, etc.

export interface StackProfile {
  id: string
  label: string
  icon: string
  category: string
  languages: string[]
  styling: string | null        // null = not applicable
  database: string | null       // null = not applicable
  playwright: boolean
  hooks: string[]
  rules: string[]
  extras: string[]
  agentTypes: string[]          // which agent templates to generate
  cloudSuggestions: string[]    // suggested cloud/hosting options
  mcpServers: string[]          // suggested MCP servers
  conventions: string[]         // default CLAUDE.md conventions
}

export interface StackDefaults {
  hooks: string[]
  rules: string[]
  extras: string[]
  devlog: string[]
  cloudSuggestions: string[]
  mcpServers: string[]
}

// ── All profiles ──

export const STACK_PROFILES: StackProfile[] = [
  // ── Web / Frontend ──
  {
    id: 'web-react', label: 'React + Vite', icon: 'R', category: 'Web / Frontend',
    languages: ['typescript'], styling: 'tailwind', database: null,
    playwright: true, hooks: ['session-start', 'post-tool-tsc', 'telegram-notify'],
    rules: ['frontend', 'ux', 'banned-techniques'],
    extras: ['playwright-mcp', 'agent-templates', 'plugin-frontend-design', 'memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['frontend', 'qa'],
    cloudSuggestions: ['vercel', 'cloudflare'],
    mcpServers: ['playwright'],
    conventions: ['Component-driven architecture', 'Barrel exports for clean imports'],
  },
  {
    id: 'nextjs', label: 'Next.js', icon: 'N', category: 'Web / Frontend',
    languages: ['typescript'], styling: 'tailwind', database: 'postgresql',
    playwright: true, hooks: ['session-start', 'post-tool-tsc', 'telegram-notify'],
    rules: ['frontend', 'ux', 'banned-techniques'],
    extras: ['playwright-mcp', 'agent-templates', 'plugin-frontend-design', 'memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['frontend', 'qa'],
    cloudSuggestions: ['vercel', 'supabase'],
    mcpServers: ['playwright'],
    conventions: ['App Router with Server Components', 'API routes for backend logic', 'Server Actions for mutations'],
  },
  {
    id: 'sveltekit', label: 'SvelteKit', icon: 'Sv', category: 'Web / Frontend',
    languages: ['typescript'], styling: 'tailwind', database: null,
    playwright: true, hooks: ['session-start', 'post-tool-tsc', 'telegram-notify'],
    rules: ['frontend', 'ux', 'banned-techniques'],
    extras: ['playwright-mcp', 'agent-templates', 'plugin-frontend-design', 'memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['frontend', 'qa'],
    cloudSuggestions: ['vercel', 'cloudflare'],
    mcpServers: ['playwright'],
    conventions: ['Load functions for data fetching', 'Form actions for mutations'],
  },
  {
    id: 'astro', label: 'Astro (content)', icon: 'As', category: 'Web / Frontend',
    languages: ['typescript'], styling: 'tailwind', database: null,
    playwright: true, hooks: ['session-start', 'post-tool-tsc', 'telegram-notify'],
    rules: ['frontend', 'banned-techniques'],
    extras: ['playwright-mcp', 'plugin-frontend-design', 'memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['qa'],
    cloudSuggestions: ['cloudflare', 'vercel'],
    mcpServers: ['playwright'],
    conventions: ['Content collections for structured data', 'Islands architecture for interactivity'],
  },
  {
    id: 'nuxt', label: 'Nuxt (Vue)', icon: 'Nx', category: 'Web / Frontend',
    languages: ['typescript'], styling: 'tailwind', database: null,
    playwright: true, hooks: ['session-start', 'post-tool-tsc', 'telegram-notify'],
    rules: ['frontend', 'ux', 'banned-techniques'],
    extras: ['playwright-mcp', 'agent-templates', 'plugin-frontend-design', 'memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['frontend', 'qa'],
    cloudSuggestions: ['vercel', 'cloudflare'],
    mcpServers: ['playwright'],
    conventions: ['Composables for shared logic', 'Auto-imports for components and utils'],
  },
  {
    id: 'remix', label: 'Remix', icon: 'Rm', category: 'Web / Frontend',
    languages: ['typescript'], styling: 'tailwind', database: 'postgresql',
    playwright: true, hooks: ['session-start', 'post-tool-tsc', 'telegram-notify'],
    rules: ['frontend', 'ux', 'banned-techniques'],
    extras: ['playwright-mcp', 'agent-templates', 'plugin-frontend-design', 'memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['frontend', 'qa'],
    cloudSuggestions: ['fly-io', 'vercel'],
    mcpServers: ['playwright'],
    conventions: ['Loader/action pattern for data', 'Progressive enhancement first'],
  },

  // ── Full-Stack ──
  {
    id: 'fullstack-node', label: 'React + Node/Express', icon: 'FN', category: 'Full-Stack',
    languages: ['typescript'], styling: 'tailwind', database: 'postgresql',
    playwright: true, hooks: ['session-start', 'post-tool-tsc', 'telegram-notify'],
    rules: ['frontend', 'ux', 'node-api', 'banned-techniques'],
    extras: ['playwright-mcp', 'agent-templates', 'plugin-frontend-design', 'memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['frontend', 'backend-node', 'qa'],
    cloudSuggestions: ['railway', 'gcp'],
    mcpServers: ['playwright'],
    conventions: ['Separate frontend/ and backend/ directories', 'REST or tRPC for API layer'],
  },
  {
    id: 'fullstack-python', label: 'React + FastAPI', icon: 'FP', category: 'Full-Stack',
    languages: ['typescript', 'python'], styling: 'tailwind', database: 'postgresql',
    playwright: true, hooks: ['session-start', 'post-tool-tsc', 'post-tool-pycache', 'telegram-notify'],
    rules: ['frontend', 'ux', 'python-api', 'banned-techniques'],
    extras: ['playwright-mcp', 'agent-templates', 'plugin-frontend-design', 'memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['frontend', 'backend-py', 'qa'],
    cloudSuggestions: ['gcp', 'railway'],
    mcpServers: ['playwright'],
    conventions: ['Separate frontend/ and api/ directories', 'Pydantic models for validation'],
  },
  {
    id: 'fullstack-htmx', label: 'Python + HTMX', icon: 'HX', category: 'Full-Stack',
    languages: ['python'], styling: 'plain-css', database: 'sqlite',
    playwright: false, hooks: ['session-start', 'post-tool-pycache', 'telegram-notify'],
    rules: ['python-api', 'banned-techniques'],
    extras: ['memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['backend-py', 'qa'],
    cloudSuggestions: ['fly-io', 'gcp'],
    mcpServers: [],
    conventions: ['HTMX for interactivity, minimal JavaScript', 'Server-rendered HTML partials'],
  },

  // ── Backend Only ──
  {
    id: 'python-backend', label: 'FastAPI / Django', icon: 'Py', category: 'Backend',
    languages: ['python'], styling: null, database: 'postgresql',
    playwright: false, hooks: ['session-start', 'post-tool-pycache', 'telegram-notify'],
    rules: ['python-api', 'banned-techniques'],
    extras: ['memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['backend-py', 'qa'],
    cloudSuggestions: ['gcp', 'docker', 'railway'],
    mcpServers: [],
    conventions: ['Pydantic models for request/response validation', 'Alembic for DB migrations'],
  },
  {
    id: 'node-backend', label: 'Express / NestJS', icon: 'No', category: 'Backend',
    languages: ['typescript'], styling: null, database: 'postgresql',
    playwright: false, hooks: ['session-start', 'post-tool-tsc', 'telegram-notify'],
    rules: ['node-api', 'banned-techniques'],
    extras: ['memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['backend-node', 'qa'],
    cloudSuggestions: ['railway', 'gcp', 'docker'],
    mcpServers: [],
    conventions: ['Controller/service/repository pattern', 'Zod for input validation'],
  },
  {
    id: 'go-backend', label: 'Go API', icon: 'Go', category: 'Backend',
    languages: ['go'], styling: null, database: 'postgresql',
    playwright: false, hooks: ['session-start', 'telegram-notify'],
    rules: ['go-api', 'banned-techniques'],
    extras: ['memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['qa'],
    cloudSuggestions: ['gcp', 'fly-io', 'docker'],
    mcpServers: [],
    conventions: ['Standard project layout (cmd/, internal/, pkg/)', 'Interfaces for testability'],
  },
  {
    id: 'rust-backend', label: 'Rust (Axum/Actix)', icon: 'Rs', category: 'Backend',
    languages: ['rust'], styling: null, database: 'postgresql',
    playwright: false, hooks: ['session-start', 'telegram-notify'],
    rules: ['rust-api', 'banned-techniques'],
    extras: ['memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['qa'],
    cloudSuggestions: ['fly-io', 'docker'],
    mcpServers: [],
    conventions: ['Workspace layout with lib/ and bin/ crates', 'Error handling with thiserror/anyhow'],
  },

  // ── Desktop ──
  {
    id: 'electron', label: 'Electron + React', icon: 'El', category: 'Desktop',
    languages: ['typescript'], styling: 'tailwind', database: 'sqlite',
    playwright: false, hooks: ['session-start', 'post-tool-tsc', 'telegram-notify'],
    rules: ['frontend', 'ux', 'banned-techniques'],
    extras: ['agent-templates', 'plugin-frontend-design', 'memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['frontend', 'qa'],
    cloudSuggestions: [],
    mcpServers: [],
    conventions: ['Main/renderer process separation', 'IPC for all cross-process communication'],
  },
  {
    id: 'tauri', label: 'Tauri (Rust + Web)', icon: 'Ta', category: 'Desktop',
    languages: ['typescript', 'rust'], styling: 'tailwind', database: 'sqlite',
    playwright: false, hooks: ['session-start', 'post-tool-tsc', 'telegram-notify'],
    rules: ['frontend', 'ux', 'banned-techniques'],
    extras: ['agent-templates', 'plugin-frontend-design', 'memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['frontend', 'qa'],
    cloudSuggestions: [],
    mcpServers: [],
    conventions: ['Tauri commands for Rust ↔ JS bridge', 'Minimal bundle size focus'],
  },

  // ── Mobile ──
  {
    id: 'react-native', label: 'React Native / Expo', icon: 'RN', category: 'Mobile',
    languages: ['typescript'], styling: null, database: null,
    playwright: false, hooks: ['session-start', 'post-tool-tsc', 'telegram-notify'],
    rules: ['mobile', 'ux', 'banned-techniques'],
    extras: ['agent-templates', 'plugin-frontend-design', 'memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['mobile', 'qa'],
    cloudSuggestions: ['supabase'],
    mcpServers: [],
    conventions: ['Expo managed workflow', 'React Navigation for routing'],
  },

  // ── Games ──
  {
    id: 'pygame', label: 'Pygame (2D)', icon: 'PG', category: 'Games',
    languages: ['python'], styling: null, database: null,
    playwright: false, hooks: ['session-start', 'post-tool-pycache', 'telegram-notify'],
    rules: ['game-loop', 'banned-techniques'],
    extras: ['memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['qa'],
    cloudSuggestions: [],
    mcpServers: [],
    conventions: ['Game loop: input → update → render', 'Sprite groups for entity management', 'Assets in assets/ directory'],
  },
  {
    id: 'godot', label: 'Godot', icon: 'Gd', category: 'Games',
    languages: ['gdscript'], styling: null, database: null,
    playwright: false, hooks: ['session-start', 'telegram-notify'],
    rules: ['game-loop', 'banned-techniques'],
    extras: ['memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['qa'],
    cloudSuggestions: [],
    mcpServers: [],
    conventions: ['Scene tree architecture', 'Signals for decoupled communication'],
  },

  // ── CLI / Scripts / Automation ──
  {
    id: 'cli-node', label: 'Node.js CLI', icon: 'CN', category: 'CLI / Scripts',
    languages: ['typescript'], styling: null, database: null,
    playwright: false, hooks: ['session-start', 'post-tool-tsc', 'telegram-notify'],
    rules: ['banned-techniques'],
    extras: ['memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['qa'],
    cloudSuggestions: [],
    mcpServers: [],
    conventions: ['Commander.js or yargs for argument parsing', 'Publish to npm registry'],
  },
  {
    id: 'cli-python', label: 'Python CLI', icon: 'CP', category: 'CLI / Scripts',
    languages: ['python'], styling: null, database: null,
    playwright: false, hooks: ['session-start', 'post-tool-pycache', 'telegram-notify'],
    rules: ['banned-techniques'],
    extras: ['memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['qa'],
    cloudSuggestions: [],
    mcpServers: [],
    conventions: ['Click or Typer for CLI framework', 'Publish to PyPI'],
  },
  {
    id: 'automation', label: 'Python automation / scraping', icon: 'Au', category: 'CLI / Scripts',
    languages: ['python'], styling: null, database: 'json-files',
    playwright: false, hooks: ['session-start', 'post-tool-pycache', 'telegram-notify'],
    rules: ['banned-techniques'],
    extras: ['memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['qa'],
    cloudSuggestions: ['gcp'],
    mcpServers: [],
    conventions: ['Respect robots.txt and rate limits', 'Cache responses locally'],
  },

  // ── Data / ML ──
  {
    id: 'data-science', label: 'Jupyter + pandas', icon: 'DS', category: 'Data / ML',
    languages: ['python'], styling: null, database: null,
    playwright: false, hooks: ['session-start', 'post-tool-pycache', 'telegram-notify'],
    rules: ['data-pipeline', 'banned-techniques'],
    extras: ['memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['qa'],
    cloudSuggestions: ['gcp'],
    mcpServers: ['gcp'],
    conventions: ['Notebooks for exploration, .py for production', 'Data in data/, outputs in output/'],
  },
  {
    id: 'ml-pipeline', label: 'ML training pipeline', icon: 'ML', category: 'Data / ML',
    languages: ['python'], styling: null, database: null,
    playwright: false, hooks: ['session-start', 'post-tool-pycache', 'telegram-notify'],
    rules: ['data-pipeline', 'banned-techniques'],
    extras: ['memory-seed', 'readme', 'skip-permissions'],
    agentTypes: ['qa'],
    cloudSuggestions: ['gcp'],
    mcpServers: ['gcp'],
    conventions: ['Reproducible experiments with config files', 'Model checkpoints in checkpoints/', 'Weights & Biases or MLflow for tracking'],
  },

  // ── Other ──
  {
    id: 'static-site', label: 'HTML / CSS / JS', icon: 'HT', category: 'Other',
    languages: ['javascript'], styling: 'plain-css', database: null,
    playwright: false, hooks: ['session-start', 'telegram-notify'],
    rules: ['banned-techniques'],
    extras: ['memory-seed', 'readme', 'skip-permissions'],
    agentTypes: [],
    cloudSuggestions: ['cloudflare'],
    mcpServers: [],
    conventions: ['Semantic HTML', 'Mobile-first CSS'],
  },
]

// ── Lookup ──

export function getProfile(techStack: string): StackProfile | undefined {
  return STACK_PROFILES.find((p) => p.id === techStack)
}

export function getProfilesByCategory(): Record<string, StackProfile[]> {
  const groups: Record<string, StackProfile[]> = {}
  for (const p of STACK_PROFILES) {
    if (!groups[p.category]) groups[p.category] = []
    groups[p.category].push(p)
  }
  return groups
}

// ── Smart defaults based on stack ──

export function getSmartDefaults(techStack: string, languages: string[]): StackDefaults {
  const profile = getProfile(techStack)

  if (profile) {
    return {
      hooks: profile.hooks,
      rules: profile.rules,
      extras: profile.extras,
      devlog: ['summaries', 'hours', 'decisions', 'experiments'],
      cloudSuggestions: profile.cloudSuggestions,
      mcpServers: profile.mcpServers,
    }
  }

  // Fallback: infer from languages
  const hasTS = languages.some((l) => /typescript/i.test(l))
  const hasPy = languages.some((l) => /python/i.test(l))
  const hooks = ['session-start']
  const rules = ['banned-techniques']
  const extras = ['memory-seed', 'readme', 'skip-permissions']

  if (hasTS) hooks.push('post-tool-tsc')
  if (hasPy) hooks.push('post-tool-pycache')
  hooks.push('telegram-notify')

  return {
    hooks,
    rules,
    extras,
    devlog: ['summaries', 'hours', 'decisions', 'experiments'],
    cloudSuggestions: [],
    mcpServers: [],
  }
}
