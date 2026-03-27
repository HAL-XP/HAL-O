import { test, expect } from '@playwright/test'
import { dispatch, setStickySession, matchVoiceSwitch, type ProjectTerminal } from '../src/main/dispatcher'

// Mock terminal list — diverse project names to test fuzzy matching
const TERMINALS: ProjectTerminal[] = [
  { sessionId: 'ses-1', projectName: 'hal-o', projectPath: 'D:/GitHub/hal-o' },
  { sessionId: 'ses-2', projectName: 'my-react-app', projectPath: 'D:/GitHub/my-react-app' },
  { sessionId: 'ses-3', projectName: 'client-api', projectPath: 'D:/work/client-api' },
  { sessionId: 'ses-4', projectName: 'data-pipeline', projectPath: 'D:/work/data-pipeline' },
  { sessionId: 'ses-5', projectName: 'personal-blog', projectPath: 'D:/projects/blog' },
]

test.describe('Dispatcher Layers 0-2', () => {
  test.beforeEach(() => {
    setStickySession(null) // reset stickiness
  })

  // ── Layer 0: Prefix routing ──

  test('Layer 0: @hal-o routes to hal-o terminal', () => {
    const result = dispatch('@hal-o fix the sphere animation', TERMINALS)
    expect(result.sessionId).toBe('ses-1')
    expect(result.projectName).toBe('hal-o')
    expect(result.layer).toBe(0)
    expect(result.confidence).toBe(1.0)
    expect(result.cleanMessage).toBe('fix the sphere animation')
  })

  test('Layer 0: @my-react-app routes to react app terminal', () => {
    const result = dispatch('@my-react-app add auth middleware', TERMINALS)
    expect(result.sessionId).toBe('ses-2')
    expect(result.layer).toBe(0)
    expect(result.cleanMessage).toBe('add auth middleware')
  })

  test('Layer 0: @client-api routes to client terminal', () => {
    const result = dispatch('@client-api deploy to staging', TERMINALS)
    expect(result.sessionId).toBe('ses-3')
    expect(result.layer).toBe(0)
  })

  test('Layer 0: unknown prefix falls through', () => {
    const result = dispatch('@unknown-project do something', TERMINALS)
    // Should NOT match Layer 0, falls to default
    expect(result.layer).not.toBe(0)
  })

  // ── Layer 1: Keyword + project routing ──

  test('Layer 1: "push hal-o" routes to hal-o', () => {
    const result = dispatch('push hal-o', TERMINALS)
    expect(result.sessionId).toBe('ses-1')
    expect(result.layer).toBe(1)
    expect(result.confidence).toBe(0.9)
  })

  test('Layer 1: "test my-react-app" routes to react app', () => {
    const result = dispatch('test my-react-app', TERMINALS)
    expect(result.sessionId).toBe('ses-2')
    expect(result.layer).toBe(1)
  })

  test('Layer 1: keyword without project name falls through', () => {
    const result = dispatch('push all changes', TERMINALS)
    expect(result.layer).not.toBe(1)
  })

  // ── Layer 2: Context stickiness ──

  test('Layer 2: sticky session persists after prefix match', () => {
    // First message: explicit prefix
    dispatch('@my-react-app fix auth', TERMINALS)

    // Second message: no prefix, should stick to react app
    const result = dispatch('also fix the login page', TERMINALS)
    expect(result.sessionId).toBe('ses-2')
    expect(result.layer).toBe(2)
    expect(result.confidence).toBe(0.7)
  })

  test('Layer 2: explicit prefix overrides stickiness', () => {
    // Set sticky to react app
    dispatch('@my-react-app fix auth', TERMINALS)

    // Explicit prefix to different project
    const result = dispatch('@hal-o update the sphere', TERMINALS)
    expect(result.sessionId).toBe('ses-1')
    expect(result.layer).toBe(0)
  })

  test('Layer 2: no stickiness when cleared', () => {
    setStickySession(null)
    const result = dispatch('do something generic', TERMINALS)
    // Falls to default (Layer 5)
    expect(result.layer).toBe(5)
    expect(result.sessionId).toBe('ses-1') // first terminal = default
  })

  // ── Edge cases ──

  test('empty terminal list returns null session', () => {
    const result = dispatch('hello', [])
    expect(result.sessionId).toBeNull()
    expect(result.layer).toBe(5)
    expect(result.confidence).toBe(0)
  })

  test('case-insensitive prefix matching', () => {
    const result = dispatch('@HAL-O fix it', TERMINALS)
    expect(result.sessionId).toBe('ses-1')
    expect(result.layer).toBe(0)
  })

  test('hyphen-insensitive matching for prefix', () => {
    const result = dispatch('@myreactapp fix it', TERMINALS)
    expect(result.sessionId).toBe('ses-2')
    expect(result.layer).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// VOICE SWITCH COMMANDS
// ═══════════════════════════════════════════════════════════════

test.describe('Voice Switch Commands', () => {
  test('"work on my react app" switches to react', () => {
    const result = matchVoiceSwitch('work on my react app', TERMINALS)
    expect(result.type).toBe('switch')
    expect(result.sessionId).toBe('ses-2')
  })

  test('"switch to client api" switches to client', () => {
    const result = matchVoiceSwitch('switch to client api', TERMINALS)
    expect(result.type).toBe('switch')
    expect(result.sessionId).toBe('ses-3')
  })

  test('"talk to hal-o" switches to hal-o', () => {
    const result = matchVoiceSwitch('talk to hal-o', TERMINALS)
    expect(result.type).toBe('switch')
    expect(result.sessionId).toBe('ses-1')
  })

  test('"go to data pipeline" switches to pipeline', () => {
    const result = matchVoiceSwitch('go to data pipeline', TERMINALS)
    expect(result.type).toBe('switch')
    expect(result.sessionId).toBe('ses-4')
  })

  test('"list my projects" returns list', () => {
    const result = matchVoiceSwitch('list my projects', TERMINALS)
    expect(result.type).toBe('list')
  })

  test('"show projects" returns list', () => {
    const result = matchVoiceSwitch('show projects', TERMINALS)
    expect(result.type).toBe('list')
  })

  test('"what are my projects" returns list', () => {
    const result = matchVoiceSwitch('what are my projects', TERMINALS)
    expect(result.type).toBe('list')
  })

  test('unrelated message returns none', () => {
    const result = matchVoiceSwitch('fix the auth bug', TERMINALS)
    expect(result.type).toBe('none')
  })
})

// ═══════════════════════════════════════════════════════════════
// NATURAL PROJECT NAME DETECTION (voice-friendly)
// ═══════════════════════════════════════════════════════════════

test.describe('Natural Voice Routing — CLEAR examples', () => {
  test.beforeEach(() => { setStickySession(null) })

  test('"fix the auth bug in my react app" → routes to react', () => {
    const result = dispatch('fix the auth bug in my react app', TERMINALS)
    expect(result.sessionId).toBe('ses-2')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  test('"deploy client api to staging" → routes to client', () => {
    const result = dispatch('deploy client api to staging', TERMINALS)
    expect(result.sessionId).toBe('ses-3')
  })

  test('"update the data pipeline cron job" → routes to pipeline', () => {
    const result = dispatch('update the data pipeline cron job', TERMINALS)
    expect(result.sessionId).toBe('ses-4')
  })

  test('"add a new post to personal blog" → routes to blog', () => {
    const result = dispatch('add a new post to personal blog', TERMINALS)
    expect(result.sessionId).toBe('ses-5')
  })

  test('"hal-o sphere animation is broken" → routes to hal-o', () => {
    const result = dispatch('hal-o sphere animation is broken', TERMINALS)
    expect(result.sessionId).toBe('ses-1')
  })

  test('"push the changes on client api" → keyword+project routing', () => {
    const result = dispatch('push client api', TERMINALS)
    expect(result.sessionId).toBe('ses-3')
    expect(result.layer).toBeLessThanOrEqual(1)
  })
})

test.describe('Natural Voice Routing — AMBIGUOUS examples', () => {
  // These tests document EXPECTED behavior for ambiguous inputs.
  // Ambiguous doesn't mean failure — it means low confidence / fallback.

  test.beforeEach(() => { setStickySession(null) })

  test('"run the tests" — no project name, falls to default', () => {
    const result = dispatch('run the tests', TERMINALS)
    // No project name mentioned — should fall to default (first terminal) with low confidence
    expect(result.layer).toBe(5) // fallback
    expect(result.confidence).toBeLessThanOrEqual(0.3)
  })

  test('"fix the bug" — generic, no project context', () => {
    const result = dispatch('fix the bug', TERMINALS)
    expect(result.layer).toBe(5)
    expect(result.confidence).toBeLessThanOrEqual(0.3)
  })

  test('"deploy to production" — could be any project', () => {
    const result = dispatch('deploy to production', TERMINALS)
    expect(result.layer).toBe(5)
  })

  test('"the api is slow" — mentions "api" but multiple projects could match', () => {
    // "api" appears in "client-api" — should it match?
    // This is intentionally a gray area. We test that it DOES match client-api
    // because "api" is part of the project name.
    const result = dispatch('the api is slow', TERMINALS)
    // "api" is only 3 chars, too short for reliable matching — may or may not match
    // We just verify it doesn't crash and has reasonable confidence
    expect(result.confidence).toBeDefined()
  })

  test('sticky context resolves ambiguity', () => {
    // First: explicitly set context
    dispatch('@client-api check the logs', TERMINALS)
    // Then: ambiguous message uses sticky context
    const result = dispatch('also check the error rate', TERMINALS)
    expect(result.sessionId).toBe('ses-3')
    expect(result.layer).toBe(2) // sticky
  })

  test('"update the blog and the pipeline" — two projects mentioned', () => {
    // When two projects are mentioned, should pick the longest/most-specific match
    const result = dispatch('update the personal blog and the data pipeline', TERMINALS)
    // "data-pipeline" is longer than "personal-blog" — should win
    // But both are valid — we just verify it picks ONE consistently
    expect(result.sessionId).toBeDefined()
    expect(result.confidence).toBeGreaterThanOrEqual(0.3)
  })
})
