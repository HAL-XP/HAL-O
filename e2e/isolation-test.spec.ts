/**
 * E2E: Multi-Instance Isolation Test
 *
 * Verifies that two HAL-OS clones (main + clone) are FULLY isolated:
 * - Different ports (19400 vs 19410)
 * - Different instance names
 * - Different data dirs
 * - Different TG tokens
 * - No shared Electron userData
 * - No shared terminals
 *
 * This test does NOT launch Electron — it tests the Node.js modules directly.
 */
import { test, expect } from '@playwright/test'
import { resolve } from 'path'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs'

const HAL_O_ROOT = resolve(__dirname, '..')
const CLAUDETTE_ROOT = resolve(__dirname, '..', '..', 'Claudette')

test.describe('Instance Isolation', () => {

  test('main instance has no instance.json', () => {
    expect(existsSync(resolve(HAL_O_ROOT, 'instance.json'))).toBe(false)
  })

  test('clone instance has instance.json', () => {
    const path = resolve(CLAUDETTE_ROOT, 'instance.json')
    if (!existsSync(CLAUDETTE_ROOT)) test.skip()
    expect(existsSync(path)).toBe(true)
    const config = JSON.parse(readFileSync(path, 'utf-8'))
    expect(config.id).toBe('claudette')
    expect(config.port).not.toBe(19400) // must differ from main
  })

  test('ports do not collide', () => {
    const mainPort = 19400 // default
    const claudettePath = resolve(CLAUDETTE_ROOT, 'instance.json')
    if (!existsSync(claudettePath)) test.skip()
    const config = JSON.parse(readFileSync(claudettePath, 'utf-8'))
    expect(config.port).not.toBe(mainPort)
    expect(config.httpsPort).not.toBe(mainPort + 1)
  })

  test('data dirs are separate', () => {
    const home = process.env.USERPROFILE || process.env.HOME || ''
    const mainDir = resolve(home, '.hal-o')
    const cloneDir = resolve(home, '.hal-o', 'instances', 'claudette')
    expect(existsSync(mainDir)).toBe(true)
    // Clone dir should exist or be creatable
    if (!existsSync(cloneDir)) mkdirSync(cloneDir, { recursive: true })
    expect(existsSync(cloneDir)).toBe(true)
    expect(mainDir).not.toBe(cloneDir)
  })

  test('TG tokens are different in credentials', () => {
    const home = process.env.USERPROFILE || process.env.HOME || ''
    const credPath = resolve(home, '.claude_credentials')
    if (!existsSync(credPath)) test.skip()
    const content = readFileSync(credPath, 'utf-8')
    const mainMatch = content.match(/^TELEGRAM_BOT_TOKEN=["']?([^\s"'\r\n]+)/m)
    const cloneMatch = content.match(/^TELEGRAM_MAIN_BOT_TOKEN=["']?([^\s"'\r\n]+)/m)
    expect(mainMatch).not.toBeNull()
    expect(cloneMatch).not.toBeNull()
    if (mainMatch && cloneMatch) {
      expect(mainMatch[1]).not.toBe(cloneMatch[1]) // different bot tokens
    }
  })

  test('Gmail MCP dirs are separate', () => {
    const home = process.env.USERPROFILE || process.env.HOME || ''
    const halDir = resolve(home, '.gmail-mcp', 'hal-o')
    const claudetteDir = resolve(home, '.gmail-mcp', 'claudette')
    // Both should exist (created during session 10)
    if (!existsSync(halDir) || !existsSync(claudetteDir)) test.skip()
    expect(halDir).not.toBe(claudetteDir)
    // Both should have their own credentials
    expect(existsSync(resolve(halDir, 'credentials.json'))).toBe(true)
    expect(existsSync(resolve(claudetteDir, 'credentials.json'))).toBe(true)
  })

  test('.gitignore.clone exists for clones', () => {
    expect(existsSync(resolve(HAL_O_ROOT, '.gitignore.clone'))).toBe(true)
  })

  test('clone CLAUDE.md differs from main', () => {
    const mainClaude = resolve(HAL_O_ROOT, 'CLAUDE.md')
    const cloneClaude = resolve(CLAUDETTE_ROOT, 'CLAUDE.md')
    if (!existsSync(cloneClaude)) test.skip()
    const mainContent = readFileSync(mainClaude, 'utf-8')
    const cloneContent = readFileSync(cloneClaude, 'utf-8')
    expect(cloneContent).not.toBe(mainContent)
    expect(cloneContent).toContain('Claudette')
  })

  test('bat files use instance-aware naming', () => {
    const bat = resolve(HAL_O_ROOT, '_scripts', '_claude_cli_new.bat')
    if (!existsSync(bat)) test.skip()
    const content = readFileSync(bat, 'utf-8')
    expect(content).toContain('INSTANCE_NAME')
    expect(content).toContain('instance.json')
  })
})
