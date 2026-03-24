interface ProjectConfig {
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

function stackLabel(tech: string): string {
  const map: Record<string, string> = {
    'web-react': 'React + Vite',
    'nextjs': 'Next.js',
    'sveltekit': 'SvelteKit',
    'astro': 'Astro',
    'nuxt': 'Nuxt (Vue.js)',
    'remix': 'Remix',
    'fullstack-node': 'React + Node.js',
    'fullstack-python': 'React + Python (FastAPI)',
    'fullstack-htmx': 'Python + HTMX',
    'python-backend': 'Python (FastAPI)',
    'node-backend': 'Node.js',
    'go-backend': 'Go',
    'rust-backend': 'Rust (Axum/Actix)',
    'electron': 'Electron + React',
    'tauri': 'Tauri (Rust + Web)',
    'react-native': 'React Native / Expo',
    'pygame': 'Pygame (2D Game)',
    'godot': 'Godot (GDScript)',
    'cli-node': 'Node.js CLI',
    'cli-python': 'Python CLI',
    'cli-tool': 'CLI Tool',
    'automation': 'Python Automation',
    'data-science': 'Jupyter + pandas',
    'ml-pipeline': 'Python ML Pipeline',
    'static-site': 'HTML/CSS/JS',
  }
  return map[tech] || tech
}

function hasGo(config: ProjectConfig): boolean {
  if (config.techStack === 'go-backend') return true
  if (config.languages.some(l => /\bgo\b/i.test(l))) return true
  return /\bgo\b/i.test(config.techStack)
}

function hasRust(config: ProjectConfig): boolean {
  if (['rust-backend', 'tauri'].includes(config.techStack)) return true
  if (config.languages.some(l => /rust/i.test(l))) return true
  return /rust|actix|axum/i.test(config.techStack)
}

function isGame(config: ProjectConfig): boolean {
  return ['pygame', 'godot'].includes(config.techStack) || /game|pygame|godot/i.test(config.techStack)
}

function isDataScience(config: ProjectConfig): boolean {
  return ['data-science', 'ml-pipeline'].includes(config.techStack) || /jupyter|pandas|data.?science|ml/i.test(config.techStack)
}

function hasFrontend(config: ProjectConfig): boolean {
  if (['web-react', 'fullstack-node', 'fullstack-python', 'electron'].includes(config.techStack)) return true
  return /react|vue|svelte|next|nuxt|angular|frontend|vite/i.test(config.techStack)
}

function hasProfiling(config: ProjectConfig): boolean {
  if (['electron', 'web-react', 'pygame', 'godot'].includes(config.techStack)) return true
  return /three|3d|game|canvas|webgl/i.test(config.techStack) ||
    /three|3d|game|canvas|webgl/i.test(config.description)
}

function hasPython(config: ProjectConfig): boolean {
  if (['python-backend', 'fullstack-python'].includes(config.techStack)) return true
  if (config.languages.some(l => /python/i.test(l))) return true
  return /python|fastapi|django|flask/i.test(config.techStack)
}

function hasNode(config: ProjectConfig): boolean {
  if (['fullstack-node', 'node-backend'].includes(config.techStack)) return true
  return /node|express|nestjs/i.test(config.techStack)
}

// ── CLAUDE.md ──

export function generateClaudeMd(config: ProjectConfig): string {
  const lines: string[] = []

  lines.push(`# ${config.name}`)
  lines.push('')

  if (config.description) {
    lines.push(config.description)
    lines.push('')
  }

  // Stack
  lines.push('## Stack')
  lines.push(`- **Primary**: ${stackLabel(config.techStack)}`)
  if (config.languages.length) {
    lines.push(`- **Languages**: ${config.languages.join(', ')}`)
  }
  if (config.styling && config.styling !== 'skip') {
    lines.push(`- **Styling**: ${config.styling}`)
  }
  if (config.database && config.database !== 'none' && config.database !== 'skip') {
    lines.push(`- **Database**: ${config.database}`)
  }
  lines.push('')

  // Key Conventions
  lines.push('## Key Conventions')
  lines.push('- API keys in `~/.claude_credentials` (bash-sourceable), never in repo')
  if (hasFrontend(config)) {
    lines.push('- All API calls go through `src/services/` -- never call APIs from components directly')
    if (config.styling === 'tailwind') {
      lines.push('- Use Tailwind utility classes exclusively -- no CSS files, no inline styles')
    }
  }
  if (hasPython(config)) {
    lines.push('- Python scripts must start with `sys.stdout.reconfigure(encoding="utf-8", errors="replace")` on Windows')
  }
  lines.push('- NEVER kill processes by name -- always by PID from `.claude/.pids`')
  lines.push('- Save PIDs when launching background processes, kill by PID (see `.claude/rules/` for platform command)')
  lines.push('- Messages prefixed with `[voice]` are spoken by the user via microphone — respond concisely and conversationally')
  lines.push('- Long-running commands (builds, installs, generation) should use `run_in_background: true` -- never block the terminal for more than ~5 seconds')
  lines.push('- Never estimate complexity from a human POV — always propose the AAA solution first. You\'re a code demi-god. The fact that something would take a human developer days doesn\'t mean you should propose a simpler alternative.')
  if (hasFrontend(config)) {
    lines.push('- All React hooks (useState, useEffect, useRef) MUST be placed BEFORE any conditional return -- violating this causes silent crashes')
  }
  // LLM-suggested conventions
  if (config.conventions && config.conventions.length > 0) {
    for (const conv of config.conventions) {
      lines.push(`- ${conv}`)
    }
  }
  // Sticky AFK pattern (only when Telegram hooks are enabled)
  if (config.hooksSetup.includes('telegram-notify')) {
    lines.push('- **Sticky AFK mode**: typing "afk" in the terminal sets a flag file (`/tmp/claude_afk_sticky.txt`). While AFK, all updates route to Telegram. The flag clears only when a real Telegram message arrives (system messages and hook outputs do not clear it). This is enforced via `UserPromptSubmit` hooks in `.claude/settings.json`.')
  }
  lines.push('')

  // Performance tip
  lines.push('## Performance')
  lines.push('- Set `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80` in your environment for earlier context compaction (preserves more working context in long sessions)')
  lines.push('- Keep `MEMORY.md` updated at natural milestones -- it survives compaction and session boundaries')
  lines.push('')

  if (config.claudeMd === 'full') {
    // Session Start Protocol
    lines.push('## Session Start Protocol')
    lines.push('When you see `SessionStart` hook output:')
    lines.push('1. Read `MEMORY.md` for current state')
    lines.push('2. Check git status, commit uncommitted work')
    if (hasFrontend(config)) {
      lines.push('3. Verify dev server runs: `npm run dev`')
    }
    if (hasPython(config)) {
      lines.push(`${hasFrontend(config) ? '4' : '3'}. Verify API: \`curl -s http://localhost:8000/health\``)
    }
    lines.push('')

    // What NOT To Do
    lines.push('## What NOT To Do')
    lines.push('- Do not commit API keys, `.env` files, or credentials to git')
    if (hasFrontend(config)) {
      lines.push('- Do not use `window.alert()` / `window.confirm()` -- use custom dialog components')
      lines.push('- Do not call APIs directly from React components')
    }
    if (hasPython(config)) {
      lines.push('- Do not call heavy APIs synchronously in API route handlers')
    }
    lines.push('- Do not skip verification -- always test changes before committing')
    lines.push('')

    // Devlog
    if (config.devlog.length > 0) {
      lines.push('## Devlog (`_devlog/`)')
      lines.push('')
      if (config.devlog.includes('summaries')) {
        lines.push('**Summaries**: After each major piece of work, append to `_devlog/summaries/summary_YYYYMMDD.md`.')
        lines.push('')
        lines.push('Format:')
        lines.push('```markdown')
        lines.push('## HH:MM -- Short title')
        lines.push('- What was done')
        lines.push('- Key decisions made')
        lines.push('- Files changed')
        lines.push('```')
        lines.push('')
      }
      if (config.devlog.includes('hours')) {
        lines.push('**Hours**: Log human-equivalent hours to `_devlog/hours/hours_YYYYMMDD.md`.')
        lines.push('')
        lines.push('Format:')
        lines.push('```markdown')
        lines.push('| Task | Claude Time | Human Equiv. | Notes |')
        lines.push('|------|-------------|--------------|-------|')
        lines.push('| Description | Xmin | Xh | Context |')
        lines.push('```')
        lines.push('')
      }
      if (config.devlog.includes('decisions')) {
        lines.push('**Decisions**: Record architecture choices in `_devlog/decisions/YYYYMMDD_topic.md` with the reasoning (WHY).')
        lines.push('')
      }
      if (config.devlog.includes('experiments')) {
        lines.push('**Experiments**: Record trial results in `_devlog/experiments/YYYYMMDD_topic.md`. Verdict: adopt or kill.')
        lines.push('')
      }
      if (config.devlog.includes('perf')) {
        lines.push('**Performance**: Log baselines to `_devlog/perf/perf_YYYYMMDD.md` before and after optimization work.')
        lines.push('')
        lines.push('Format:')
        lines.push('```markdown')
        lines.push('| Metric | 10 items | 20 items | 30 items |')
        lines.push('|--------|----------|----------|----------|')
        lines.push('| FPS | 60 | 58 | 42 |')
        lines.push('| Draw calls | 124 | 248 | 372 |')
        lines.push('| Triangles | 45K | 89K | 134K |')
        lines.push('| GPU ms | 4.2 | 8.1 | 14.3 |')
        lines.push('```')
        lines.push('')
        lines.push('When to log: before/after PERF tasks, after adding 3D features or visual effects, when adding significant new UI.')
        lines.push('')
      }
    }
  }

  // Key Files
  lines.push('## Key Files')
  lines.push('| File | Purpose |')
  lines.push('|------|---------|')
  lines.push('| `.claude/rules/` | Domain-specific rules (auto-loaded) |')
  if (config.devlog.length > 0) {
    lines.push('| `_devlog/` | Session summaries, hours, decisions, experiments |')
  }
  lines.push('')

  return lines.join('\n')
}

// ── Hooks (.claude/settings.json) ──

export function generateHooksSettings(config: ProjectConfig): object {
  const hooks: Record<string, any[]> = {}

  if (config.hooksSetup.includes('session-start')) {
    const healthChecks: string[] = [
      'echo "=== SESSION INIT ==="',
      `echo "Project: ${config.name}"`,
      'echo "---"',
      'echo "Git status:"',
      'git status --short 2>/dev/null | head -15',
    ]
    if (hasFrontend(config)) {
      healthChecks.push('echo "---"')
      healthChecks.push('echo "Frontend:"')
      healthChecks.push('curl -sf http://localhost:5173 >/dev/null 2>&1 && echo " running" || echo " NOT running"')
    }
    if (hasPython(config)) {
      healthChecks.push('echo "---"')
      healthChecks.push('echo "API:"')
      healthChecks.push('curl -sf http://localhost:8000/health 2>/dev/null && echo " running" || echo " NOT running"')
    }
    healthChecks.push('echo "---"')
    healthChecks.push('echo "ACTION: Read MEMORY.md for current state. Commit any uncommitted work."')

    const startupCmd = process.platform === 'win32'
      ? `cmd /c "${healthChecks.join(' && ')}"`
      : `bash -c '${healthChecks.join('; ')}'`

    const resumeCmd = process.platform === 'win32'
      ? `cmd /c "echo === SESSION RESUMED === && echo Project: ${config.name} && echo Git branch: && git branch --show-current 2>NUL && echo Uncommitted: && git status --short 2>NUL && echo === && echo ACTION: Read MEMORY.md for current state and resume pending work."`
      : `bash -c 'echo "=== SESSION RESUMED ==="; echo "Project: ${config.name}"; echo "Git branch: $(git branch --show-current 2>/dev/null || echo N/A)"; echo "Uncommitted: $(git status --short 2>/dev/null | wc -l | tr -d " ") files"; echo "==="; echo "ACTION: Read MEMORY.md for current state and resume pending work."'`

    hooks.SessionStart = [
      {
        matcher: 'startup',
        hooks: [{
          type: 'command',
          command: startupCmd,
        }],
      },
      {
        matcher: 'resume',
        hooks: [{
          type: 'command',
          command: resumeCmd,
        }],
      },
    ]
  }

  const postToolHooks: any[] = []

  if (config.hooksSetup.includes('post-tool-tsc')) {
    postToolHooks.push({
      type: 'command',
      command: "FILE=$(echo \"$TOOL_INPUT\" | jq -r '.file_path // empty') && if echo \"$FILE\" | grep -qE '\\.(tsx|ts)$'; then npx tsc --noEmit 2>&1 | head -20; fi",
    })
  }

  if (config.hooksSetup.includes('post-tool-pycache')) {
    postToolHooks.push({
      type: 'command',
      command: "FILE=$(echo \"$TOOL_INPUT\" | jq -r '.file_path // empty') && if echo \"$FILE\" | grep -qE '\\.py$'; then find . -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null; echo '[hook] Cleared pycache'; fi",
      timeout: 10,
    })
  }

  if (postToolHooks.length > 0) {
    hooks.PostToolUse = [{
      matcher: 'Edit|Write',
      hooks: postToolHooks,
    }]
  }

  // Telegram notification hooks — permission prompts + idle with agent name prefix
  if (config.hooksSetup.includes('telegram-notify')) {
    const agentTag = config.agentName || config.name || 'Claude'
    const credPath = process.platform === 'win32'
      ? 'C:/Users/$USERNAME/.claude_credentials'
      : '~/.claude_credentials'

    const permissionCmd = `bash -c 'source ${credPath} 2>/dev/null && curl -s "https://api.telegram.org/bot\${TELEGRAM_BOT_TOKEN}/sendMessage" -d "chat_id=\${TELEGRAM_CHAT_ID}" -d "text=[${agentTag}] Permission prompt - check terminal" > /dev/null 2>&1 || true'`

    const idleCmd = `bash -c 'MSG_FILE=/tmp/claude_telegram_msg.txt; if [ -s "$MSG_FILE" ]; then source ${credPath} 2>/dev/null && MSG=$(cat "$MSG_FILE") && curl -s "https://api.telegram.org/bot\${TELEGRAM_BOT_TOKEN}/sendMessage" --data-urlencode "chat_id=\${TELEGRAM_CHAT_ID}" --data-urlencode "text=${MSG}" > /dev/null 2>&1; rm -f "$MSG_FILE"; fi'`

    hooks.Notification = [
      {
        matcher: 'permission_prompt',
        hooks: [{
          type: 'command',
          command: permissionCmd,
        }],
      },
      {
        matcher: 'idle_prompt',
        hooks: [{
          type: 'command',
          command: idleCmd,
        }],
      },
    ]

    // Channel-mode enforcement: detect Telegram vs terminal, block cross-channel replies
    // Sticky afk: once set, channel stays "telegram" until a real terminal message clears it
    const channelModeCmd = `bash -c 'INPUT=$(cat); if echo "$INPUT" | grep -q "<channel source"; then echo "telegram" > /tmp/claude_channel_mode.txt; rm -f /tmp/claude_afk_sticky.txt; elif echo "$INPUT" | grep -qi "afk"; then echo "telegram" > /tmp/claude_channel_mode.txt; echo "1" > /tmp/claude_afk_sticky.txt; elif echo "$INPUT" | grep -q "task-notification\\|command-name\\|local-command\\|system-reminder"; then true; elif [ -f /tmp/claude_afk_sticky.txt ]; then true; else echo "terminal" > /tmp/claude_channel_mode.txt; rm -f /tmp/claude_afk_sticky.txt; fi'`

    const blockCrossChannelCmd = `bash -c 'MODE=$(cat /tmp/claude_channel_mode.txt 2>/dev/null || echo "telegram"); if [ "$MODE" = "terminal" ]; then echo "{\\"decision\\":\\"block\\",\\"reason\\":\\"User is at terminal. Reply here, not Telegram.\\"}"; fi'`

    hooks.UserPromptSubmit = [{
      matcher: '',
      hooks: [{
        type: 'command',
        command: channelModeCmd,
        timeout: 5,
      }],
    }]

    if (!hooks.PreToolUse) hooks.PreToolUse = []
    hooks.PreToolUse.push({
      matcher: 'mcp__plugin_telegram_telegram__reply',
      hooks: [{
        type: 'command',
        command: blockCrossChannelCmd,
        timeout: 5,
      }],
    })
  }

  // PreCompact hook — save state before context compaction
  const preCompactCmd = `bash -c 'echo "COMPACTION IMMINENT. You MUST immediately: 1) Update MEMORY.md with current task, PIDs, log paths, next steps. 2) Commit and push any unsaved work. Do these NOW before context is lost."'`
  hooks.PreCompact = [{
    matcher: '',
    hooks: [{
      type: 'command',
      command: preCompactCmd,
    }],
  }]

  // Environment — set compaction threshold
  const env: Record<string, string> = {
    CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '80',
  }

  return { hooks, env }
}

// ── Rule Files ──

export function generateRuleFiles(config: ProjectConfig): Record<string, string> {
  const files: Record<string, string> = {}

  if (config.rulesSetup.includes('frontend')) {
    const styling = config.styling === 'tailwind'
      ? `## Styling
- Use Tailwind utility classes exclusively. No CSS files, no inline \`style={}\`.
- Use \`cn()\` from \`@/lib/utils\` for conditional/merged classes.
- No arbitrary hex colors -- use Tailwind tokens.`
      : '## Styling\n- Follow the project\'s styling conventions consistently.'

    files['frontend.md'] = `# Frontend Rules

${styling}

## Component Patterns
- Keep components focused -- one responsibility per component.
- Fetch errors: catch, extract message, show via toast. Never silently swallow.
- Use custom dialog components instead of \`window.alert()\` / \`window.confirm()\`.
`
  }

  if (config.rulesSetup.includes('ux')) {
    files['ux.md'] = `# UX Principles

## 1. State-driven UI, never interaction-driven
- All visual indicators derive from data state, not user clicks.
- useState for transient UI only (expanded/collapsed, hover).

## 2. Single source of truth
- State flows from top-level via props or context.
- After mutations, trigger state refresh via callback.

## 3. Validate before expensive actions
- Operations calling external APIs validate prerequisites first.
- Show inline warnings. Never fail silently.

## 4. Disabled means explained
- Every disabled button has a tooltip explaining WHY.

## 5. Custom dialogs, never browser-native
- NEVER use window.alert(), window.confirm(), window.prompt().
`
  }

  if (config.rulesSetup.includes('python-api')) {
    files['python-api.md'] = `# API Rules (Python Backend)

## Server
- Backend runs on \`localhost:8000\`.
- MANDATORY: \`sys.stdout.reconfigure(encoding="utf-8", errors="replace")\` in every Python script.

## MANDATORY: Restart API After Backend Changes
After ANY change to Python files:
1. Find PIDs: \`ps aux | grep python\` (or \`tasklist | grep python\` on Windows)
2. Kill: \`kill -TERM <pid>\` (or \`taskkill //PID <pid> //F\` on Windows)
3. Clear pycache: \`find . -name "__pycache__" -type d -exec rm -rf {} +\`
4. Restart in background
5. Verify: \`curl -s http://localhost:8000/health\`

## Route Patterns
- Heavy operations go through job queue -- never synchronous.
- Return JSON for data, raise appropriate HTTP exceptions for errors.
`
  }

  if (config.rulesSetup.includes('node-api')) {
    files['node-api.md'] = `# API Rules (Node.js Backend)

## Server
- Backend runs on \`localhost:3000\` (or configured port).
- Use async/await consistently. Never block the event loop.

## Route Patterns
- Validate all input at the route handler level.
- Return consistent JSON shapes: \`{ data, error, message }\`.
- Heavy operations should use worker threads or queues.
- Log errors with context (request ID, user, action).
`
  }

  if (config.rulesSetup.includes('banned-techniques')) {
    files['banned-techniques.md'] = `# Banned Techniques (proven harmful or dead -- do NOT retry)

## Libraries
- (none yet -- add entries as dead ends are discovered)

## Approaches
- (none yet)

## Dead Ends
- (none yet)

---
Add entries here as soon as something is confirmed dead.
Include the date and context. This file is auto-loaded every session.
`
  }

  if (config.rulesSetup.includes('go-api')) {
    files['go-api.md'] = `# Go API Rules

## Conventions
- Use standard library \`net/http\` where possible.
- Check all returned errors. Never use \`_\` for error returns.
- Run \`go fmt\` and \`go vet\` before every commit.

## Project Structure
- HTTP handlers in \`handlers/\`
- Business logic in \`internal/\`
- Models/types in \`models/\`

## Error Handling
- Always return errors to the caller, don't log and continue.
- Wrap errors with context: \`fmt.Errorf("action: %w", err)\`
`
  }

  if (config.rulesSetup.includes('rust-api')) {
    files['rust-api.md'] = `# Rust API Rules

## Conventions
- Run \`cargo clippy\` before every commit. Fix all warnings.
- Prefer \`Result<T, E>\` over \`.unwrap()\`. Reserve \`.unwrap()\` for tests only.
- Use \`serde\` for all serialization/deserialization.

## Error Handling
- Define custom error types with \`thiserror\`.
- Use \`?\` operator for propagation, never \`.unwrap()\` in production code.

## Project Structure
- Handlers in \`src/handlers/\`
- Models in \`src/models/\`
- Configuration in \`src/config.rs\`
`
  }

  if (config.rulesSetup.includes('game-loop')) {
    files['game-loop.md'] = `# Game Development Rules

## Game Loop
- Main loop: handle input -> update state -> render. Always in that order.
- Target 60 FPS. Use \`clock.tick(60)\` (Pygame) or equivalent.
- Separate game logic from rendering -- no draw calls in update functions.

## Asset Management
- All assets in \`assets/\` with subdirectories: \`sprites/\`, \`sounds/\`, \`fonts/\`
- Load assets once at startup, store references. Never load per frame.
- Use constants for asset paths.

## State Management
- Game state in a dedicated class (not scattered globals).
- State transitions: menu -> playing -> paused -> game_over.
`
  }

  if (config.rulesSetup.includes('data-pipeline')) {
    files['data-pipeline.md'] = `# Data Science Rules

## Notebook Conventions
- Notebooks for exploration ONLY. Move proven code to \`src/\` as modules.
- Clear all outputs before committing notebooks.

## Data Handling
- Raw data in \`data/raw/\` (never modified).
- Processed data in \`data/processed/\`.
- Large files (>10MB) go in \`.gitignore\`.

## Reproducibility
- Set random seeds everywhere (numpy, random, torch, sklearn).
- Pin all dependency versions in \`requirements.txt\`.
- Log experiment parameters and results to \`_devlog/experiments/\`.
`
  }

  if (config.rulesSetup.includes('mobile')) {
    files['mobile.md'] = `# Mobile App Rules

## Conventions
- Use Expo SDK APIs over bare React Native when possible.
- StyleSheet.create for all styles -- no inline style objects.
- Test on both iOS and Android before committing.

## Navigation
- React Navigation for all routing.
- Deep linking configured from day one.

## Performance
- Use FlatList (not ScrollView) for lists.
- Minimize re-renders with React.memo and useMemo.
`
  }

  if (config.rulesSetup.includes('profiling')) {
    files['profiling.md'] = `# Performance Profiling

## Tools by Stack

### Three.js / React Three Fiber
- **r3f-perf**: \`npm install r3f-perf\` → \`<Perf position="top-left" deepAnalyze />\` inside Canvas
- **renderer.info**: \`gl.info.render.calls\`, \`gl.info.render.triangles\`, \`gl.info.memory.geometries\`
- **Spector.js**: Capture every WebGL draw call in a single frame — browser extension or npm
- Set \`gl.info.autoReset = false\` to accumulate stats per frame, call \`gl.info.reset()\` after reading

### General Web
- **Chrome DevTools Performance tab**: Frame timing, JS flame chart
- **Chrome DevTools Memory tab**: Heap snapshots, allocation timeline
- **\`performance.memory.usedJSHeapSize\`**: JS heap in Chrome/Electron (check periodically)
- **PerformanceObserver**: Detect long tasks (>50ms) that cause frame drops

### Python Backend
- **cProfile**: \`python -m cProfile -s cumtime script.py\`
- **line_profiler**: Per-line timing for hot functions
- **memory_profiler**: \`@profile\` decorator for memory usage per line

## Baseline Protocol
1. Measure BEFORE optimization (save to \`_devlog/perf/perf_YYYYMMDD.md\`)
2. Change one thing at a time
3. Measure AFTER — same conditions, same data
4. Log the delta: what changed, how much, was it worth it

## Key Metrics
| Metric | Target | Tool |
|--------|--------|------|
| FPS | ≥60 (vsync) | requestAnimationFrame counter |
| Draw calls | Minimize | renderer.info |
| JS Heap | Stable (no growth) | performance.memory |
| Frame budget | <16.6ms | useFrame timing |
| IPC round-trip | <50ms | console.time/timeEnd |
`
  }

  return files
}

// ── Hours Tracking Rule ──

export function generateHoursTrackingRule(): string {
  return `# Hours Tracking

## Format
Append to \`_devlog/hours/hours_YYYYMMDD.md\` (one file per day):

\`\`\`markdown
# Hours Log -- YYYY-MM-DD

| Task | Type | Claude Time | Human Equiv. | Multiplier | Notes |
|------|------|-------------|--------------|------------|-------|
| Fix auth middleware | bug | 12min | 3h | 15x | CORS + token refresh edge case |
| Add user dashboard | feat | 45min | 8h | 10.7x | React + API + tests |
| Upgrade to React 19 | refactor | 8min | 2h | 15x | Breaking changes research |
| **TOTAL** | | **65min** | **13h** | **12x** | |
\`\`\`

## Estimation by Task Type
| Type | Typical Multiplier | Why |
|------|-------------------|-----|
| **bug** (debugging) | 10-20x | Humans spend most time reproducing + bisecting |
| **feat** (new feature) | 8-12x | Design decisions, wiring, testing |
| **refactor** | 10-15x | Understanding existing code, safe migration |
| **research** | 5-8x | Reading docs, comparing options (Claude has instant recall) |
| **config/devops** | 15-25x | Humans fight tooling issues, env differences |
| **test** | 8-12x | Writing assertions, covering edge cases |
| **docs** | 3-5x | Lowest multiplier — writing is less compressible |

## Guidelines
- "Human Equiv." = how long a senior full-stack dev (8h/day, no AI tools) would take
- Factor in: research, trial-and-error, context switching, testing, debugging, code review
- Be honest — don't inflate to impress or deflate to seem humble
- Update at natural milestones (after a feature, after a fix), not after every tiny change
- Include a TOTAL row with the session multiplier at session end
- Create a new file each day (same pattern as summaries)
`
}

// ── .gitignore ──

export function generateGitignore(config: ProjectConfig): string {
  const lines: string[] = [
    '# Dependencies',
    'node_modules/',
    '',
    '# Environment',
    '.env',
    '.env.local',
    '.env.*.local',
    '*credentials*',
    '',
    '# Claude Code',
    '.claude/settings.local.json',
    '.claude/agent-memory-local/',
    '.claude/.pids',
    '',
    '# Devlog (local only)',
    '_devlog/',
    '',
    '# Build output',
    'dist/',
    'out/',
    'build/',
    '',
    '# OS',
    '.DS_Store',
    'Thumbs.db',
    'desktop.ini',
  ]

  if (hasPython(config) || config.languages.includes('python')) {
    lines.push('')
    lines.push('# Python')
    lines.push('__pycache__/')
    lines.push('*.pyc')
    lines.push('*.pyo')
    lines.push('.venv/')
    lines.push('venv/')
    lines.push('*.egg-info/')
  }

  if (config.techStack === 'electron' || config.techStack === 'tauri') {
    lines.push('')
    lines.push('# Desktop')
    lines.push('release/')
    if (config.techStack === 'tauri') lines.push('src-tauri/target/')
  }

  if (hasRust(config)) {
    lines.push('')
    lines.push('# Rust')
    lines.push('target/')
  }

  if (hasGo(config)) {
    lines.push('')
    lines.push('# Go')
    lines.push('bin/')
  }

  if (isGame(config)) {
    lines.push('')
    lines.push('# Game assets (large source files)')
    lines.push('*.psd')
    lines.push('*.xcf')
    lines.push('*.blend')
  }

  if (isDataScience(config)) {
    lines.push('')
    lines.push('# Data')
    lines.push('data/raw/')
    lines.push('data/processed/')
    lines.push('models/')
    lines.push('.ipynb_checkpoints/')
  }

  if (config.playwrightMcp) {
    lines.push('')
    lines.push('# Playwright')
    lines.push('.playwright-mcp/')
    lines.push('test-results/')
    lines.push('playwright-report/')
  }

  lines.push('')
  return lines.join('\n')
}

// ── .mcp.json ──

export function generateMcpJson(): object {
  return {
    mcpServers: {
      playwright: {
        command: 'npx',
        args: ['@anthropic-ai/mcp-server-playwright@latest'],
      },
    },
  }
}

// ── README.md ──

export function generateReadme(config: ProjectConfig): string {
  const lines: string[] = []
  lines.push(`# ${config.name}`)
  lines.push('')
  if (config.description) {
    lines.push(config.description)
    lines.push('')
  }
  lines.push('## Stack')
  lines.push(`- ${stackLabel(config.techStack)}`)
  if (config.languages.length) {
    lines.push(`- Languages: ${config.languages.join(', ')}`)
  }
  if (config.styling && config.styling !== 'skip') {
    lines.push(`- Styling: ${config.styling}`)
  }
  if (config.database && config.database !== 'none' && config.database !== 'skip') {
    lines.push(`- Database: ${config.database}`)
  }
  lines.push('')
  lines.push('## Getting Started')
  lines.push('')
  lines.push('```bash')
  if (hasFrontend(config) || hasNode(config)) {
    lines.push('npm install')
    lines.push('npm run dev')
  }
  if (hasPython(config)) {
    lines.push('pip install -r requirements.txt')
    lines.push('python -m uvicorn api.main:app --reload')
  }
  lines.push('```')
  lines.push('')
  lines.push('## Claude Code')
  lines.push('')
  lines.push('This project is set up for [Claude Code](https://claude.ai/code). Run:')
  lines.push('')
  lines.push('```bash')
  lines.push('# Double-click _CLAUDE_CLI_RESUME.bat (Windows) or run ./_CLAUDE_CLI_RESUME.sh (macOS/Linux)')
  lines.push('# Or from terminal:')
  const permFlag = config.skipPermissions ? ' --dangerously-skip-permissions' : ''
  lines.push(`claude -n "${config.agentName}"${permFlag} --resume`)
  lines.push('```')
  lines.push('')
  return lines.join('\n')
}

// ── MEMORY.md Seed ──

export function generateMemorySeed(config: ProjectConfig): string {
  return `# Project Memory

## Current State
- **Project**: ${config.name}
- **Stack**: ${stackLabel(config.techStack)}
- **Status**: Fresh project, initial setup complete

## Key Technical Findings
- (populated as we discover things)

## Architecture Decisions
- (record important choices and WHY)

## User Preferences
- Always use \`~/.claude_credentials\` for API keys
- Move forward autonomously unless blocked

## Memory Files
- (topic files will be added as the project grows)
`
}

// ── Batch Files ──

export function generateBatchFile(config: ProjectConfig, resume: boolean): string {
  const lines: string[] = ['@echo off']
  lines.push(`title * ${config.agentName}`)

  const args: string[] = [
    `-n "${config.agentName}"`,
  ]
  if (config.skipPermissions) {
    args.push('--dangerously-skip-permissions')
  }

  if (resume) {
    args.push('--resume')
  }

  lines.push(`claude ${args.join(' ')}`)
  lines.push('')

  return lines.join('\r\n')
}

// ── Agent Templates ──

export function generateAgentTemplates(config: ProjectConfig): Record<string, string> {
  const templates: Record<string, string> = {}

  if (hasFrontend(config)) {
    templates['frontend-impl.md'] = `---
name: frontend-impl
description: React/TypeScript implementation agent -- writes UI code, components, state management
tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Agent"]
---

# Role

You are the **Frontend Implementation Agent**. You write UI code for ${config.name}.

# Context Files to Read First

**MANDATORY** -- read these before writing ANY code:
1. \`.claude/rules/frontend.md\` -- Component and styling conventions
${config.rulesSetup.includes('ux') ? '2. `.claude/rules/ux.md` -- UX principles\n' : ''}
# Verification Protocol (MANDATORY)

Before committing ANY change:
1. **TypeScript check**: \`npx tsc --noEmit\` -- 0 errors
2. **Visual verification**: Screenshot or test the UI change
3. **Interaction test**: If you changed interactive elements, test them

# Anti-Patterns

- NEVER commit with TypeScript errors
- NEVER use window.alert() or window.confirm()
- NEVER assume "tsc clean = feature works"
`
  }

  if (hasPython(config)) {
    templates['backend.md'] = `---
name: backend
description: Python backend agent -- writes API routes, data processing, server logic
tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Agent"]
---

# Role

You are the **Backend Agent**. You write Python backend code for ${config.name}.

# Context Files to Read First

**MANDATORY**:
1. \`.claude/rules/python-api.md\` -- API conventions, restart protocol

# Verification Protocol (MANDATORY)

Before committing ANY change:
1. **Import check**: \`python -c "import api.main"\` -- clean import
2. **Endpoint test**: \`curl -s http://localhost:8000/[endpoint]\`
3. **Restart API**: Kill, clear pycache, restart, verify health

# Anti-Patterns

- NEVER skip API restart after backend changes
- NEVER block the event loop with synchronous heavy operations
- NEVER forget \`sys.stdout.reconfigure(encoding="utf-8", errors="replace")\`
`
  }

  // QA Verifier for all projects
  templates['qa-verifier.md'] = `---
name: qa-verifier
description: Post-implementation verification gate -- verifies features work end-to-end
tools: ["Read", "Glob", "Grep", "Bash"]
---

# Role

You are the **QA Verifier Agent**. You independently verify features after implementation.
You do NOT write feature code. You only verify and report.

# Verdicts

There are exactly 3 verdicts:

- **PASS** -- You ran the feature and SAW it work (with evidence)
- **FAIL** -- You ran the feature and SAW it fail (with evidence)
- **UNVERIFIED** -- You could NOT functionally test it

> Reading code and saying "the logic looks correct" is ALWAYS verdict UNVERIFIED.
> Code review is not functional verification. Period.

# Report Format

| # | Test | Method | Verdict | Evidence |
|---|------|--------|---------|----------|
| 1 | Example | curl/playwright | PASS/FAIL/UNVERIFIED | Details |
`

  return templates
}
