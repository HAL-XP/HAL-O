// ── Version constants for HAL-O meta tracking ──

import { readFileSync } from 'fs'
import { join } from 'path'

export const RULES_VERSION = 2

// Read version from package.json at build time
let _version = '0.0.0'
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'))
  _version = pkg.version || '0.0.0'
} catch {
  // Fallback — running outside of built context
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf-8'))
    _version = pkg.version || '0.0.0'
  } catch { /* use default */ }
}

export const HAL_O_VERSION = _version
