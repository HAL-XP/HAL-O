// ── U18 Phase 4: Conflict Classification & Smart Resolution ──
// Pure utility functions for classifying and auto-resolving merge conflicts.

import type { ConflictChunk } from '../types'

// ── Conflict Classification ──

export type ConflictKind =
  | 'IDENTICAL'    // Both sides made the same change
  | 'WHITESPACE'   // Only whitespace/formatting differs
  | 'COMMENT'      // Only comments differ
  | 'IMPORT'       // Both sides added/changed imports
  | 'ADJACENT'     // Changes on adjacent/non-overlapping lines
  | 'TRIVIAL'      // Minor differences (reordering, trailing commas, etc.)
  | 'OVERLAP'      // Genuine content conflict — needs human decision

export interface ConflictClassification {
  kind: ConflictKind
  /** Short human-readable reason */
  reason: string
  /** True if this can be auto-resolved without human input */
  autoResolvable: boolean
  /** Suggested resolution if auto-resolvable */
  suggestedResolution?: 'ours' | 'theirs' | 'both' | 'custom'
  /** Custom content for smart merge (used when suggestedResolution is 'custom') */
  smartContent?: string
}

// ── Classification badges — visual config ──

export const CLASSIFICATION_COLORS: Record<ConflictKind, { bg: string; fg: string }> = {
  IDENTICAL:  { bg: '#065f4622', fg: '#4ade80' },
  WHITESPACE: { bg: '#065f4622', fg: '#34d399' },
  COMMENT:    { bg: '#065f4622', fg: '#6ee7b7' },
  IMPORT:     { bg: '#1e40af22', fg: '#60a5fa' },
  ADJACENT:   { bg: '#92400e22', fg: '#fbbf24' },
  TRIVIAL:    { bg: '#065f4622', fg: '#2dd4bf' },
  OVERLAP:    { bg: '#7f1d1d22', fg: '#f87171' },
}

// ── Normalization helpers ──

/** Normalize whitespace: collapse runs, trim lines, strip blank lines */
function normalizeWhitespace(s: string): string {
  return s
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n')
}

/** Strip single-line and multi-line comments from code */
function stripComments(s: string): string {
  // Remove single-line comments (// ...) but not URLs (://)
  let result = s.replace(/(?<![:'"])\/\/.*$/gm, '')
  // Remove multi-line comments (/* ... */)
  result = result.replace(/\/\*[\s\S]*?\*\//g, '')
  // Remove # comments (Python, shell, YAML)
  result = result.replace(/(?<=^|\s)#(?!!).*$/gm, '')
  // Remove HTML comments
  result = result.replace(/<!--[\s\S]*?-->/g, '')
  return result
}

/** Check if a string is purely import/require statements */
function isImportBlock(s: string): boolean {
  const lines = s.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  if (lines.length === 0) return false
  return lines.every(line =>
    line.startsWith('import ') ||
    line.startsWith('import{') ||
    line.startsWith('from ') ||
    line.startsWith('export ') && line.includes(' from ') ||
    line.match(/^(?:const|let|var)\s+\w+\s*=\s*require\(/) != null ||
    line.startsWith('require(') ||
    // Continuation lines (multiline imports)
    line.startsWith('}') ||
    line.startsWith(',') ||
    line === '{' ||
    // Include/using for C/C#/Java
    line.startsWith('#include') ||
    line.startsWith('using ') ||
    // Python imports
    line.startsWith('from ') ||
    // Empty/comment lines within import blocks
    line === '' ||
    line.startsWith('//')
  )
}

/** Extract individual import specifiers from an import block */
function parseImports(s: string): string[] {
  const lines = s.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  // Normalize multi-line imports into single lines first
  const joined: string[] = []
  let buf = ''
  for (const line of lines) {
    buf += (buf ? ' ' : '') + line
    // Check if the statement is complete (has balanced braces or no braces, and ends with quote)
    const openBraces = (buf.match(/\{/g) || []).length
    const closeBraces = (buf.match(/\}/g) || []).length
    if (openBraces <= closeBraces) {
      joined.push(buf.replace(/\s+/g, ' ').trim())
      buf = ''
    }
  }
  if (buf) joined.push(buf.replace(/\s+/g, ' ').trim())
  return joined.filter(l => l.length > 0)
}

/** Deduplicate and sort import statements */
function deduplicateImports(oursImports: string[], theirsImports: string[]): string {
  const seen = new Set<string>()
  const merged: string[] = []

  // Normalize for dedup: collapse whitespace
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()

  for (const imp of [...oursImports, ...theirsImports]) {
    const key = normalize(imp)
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(imp)
    }
  }

  // Sort: group by type, then alphabetically
  return merged
    .sort((a, b) => {
      // Side-effect imports (no 'from') go first
      const aHasFrom = a.includes(' from ')
      const bHasFrom = b.includes(' from ')
      if (!aHasFrom && bHasFrom) return -1
      if (aHasFrom && !bHasFrom) return 1

      // Type imports after regular imports
      const aIsType = a.startsWith('import type')
      const bIsType = b.startsWith('import type')
      if (!aIsType && bIsType) return -1
      if (aIsType && !bIsType) return 1

      // Relative imports after package imports
      const aIsRelative = a.includes("from '.")  || a.includes('from ".')
      const bIsRelative = b.includes("from '.")  || b.includes('from ".')
      if (!aIsRelative && bIsRelative) return -1
      if (aIsRelative && !bIsRelative) return 1

      return a.localeCompare(b)
    })
    .join('\n')
}

// ── Main Classification Function ──

/**
 * Classify a conflict chunk to determine its type and whether it can be auto-resolved.
 */
export function classifyConflict(chunk: ConflictChunk): ConflictClassification {
  const ours = chunk.oursContent
  const theirs = chunk.theirsContent

  // 1. Identical content — both sides made the same change
  if (ours === theirs) {
    return {
      kind: 'IDENTICAL',
      reason: 'Both sides have identical content',
      autoResolvable: true,
      suggestedResolution: 'ours',
    }
  }

  // 2. Whitespace-only difference
  if (normalizeWhitespace(ours) === normalizeWhitespace(theirs)) {
    // Prefer whichever has better formatting (more lines = more explicit formatting)
    const oursLines = ours.split('\n').length
    const theirsLines = theirs.split('\n').length
    return {
      kind: 'WHITESPACE',
      reason: 'Only whitespace/formatting differs',
      autoResolvable: true,
      suggestedResolution: oursLines >= theirsLines ? 'ours' : 'theirs',
    }
  }

  // 3. Comment-only difference
  const oursNoComments = normalizeWhitespace(stripComments(ours))
  const theirsNoComments = normalizeWhitespace(stripComments(theirs))
  if (oursNoComments === theirsNoComments && oursNoComments.length > 0) {
    // Both have the same code, differ only in comments — keep the version with more comments
    const oursCommentLines = ours.split('\n').filter(l => l.trim().startsWith('//') || l.trim().startsWith('#') || l.trim().startsWith('*')).length
    const theirsCommentLines = theirs.split('\n').filter(l => l.trim().startsWith('//') || l.trim().startsWith('#') || l.trim().startsWith('*')).length
    return {
      kind: 'COMMENT',
      reason: 'Code is identical, only comments differ',
      autoResolvable: true,
      suggestedResolution: oursCommentLines >= theirsCommentLines ? 'ours' : 'theirs',
    }
  }

  // 4. Import conflicts — both sides modified imports
  if (isImportBlock(ours) && isImportBlock(theirs)) {
    const oursImports = parseImports(ours)
    const theirsImports = parseImports(theirs)
    const merged = deduplicateImports(oursImports, theirsImports)
    return {
      kind: 'IMPORT',
      reason: `Import conflict: ${oursImports.length} ours + ${theirsImports.length} theirs`,
      autoResolvable: true,
      suggestedResolution: 'custom',
      smartContent: merged,
    }
  }

  // 5. Trivial differences (trailing commas, semicolons, quote style)
  const oursTrimmed = ours.replace(/[,;'"` ]/g, '').replace(/\s+/g, '')
  const theirsTrimmed = theirs.replace(/[,;'"` ]/g, '').replace(/\s+/g, '')
  if (oursTrimmed === theirsTrimmed && oursTrimmed.length > 0) {
    return {
      kind: 'TRIVIAL',
      reason: 'Only punctuation/quote style differs',
      autoResolvable: true,
      suggestedResolution: 'ours', // Prefer ours for trivial style differences
    }
  }

  // 6. Adjacent additions — both sides added different content (no original overlap)
  //    Heuristic: if base content is empty or neither side deleted/modified original lines
  if (chunk.baseContent !== undefined) {
    const base = chunk.baseContent.trim()
    if (base === '' && ours.trim() !== '' && theirs.trim() !== '') {
      // Both sides added new content where there was nothing before
      return {
        kind: 'ADJACENT',
        reason: 'Both sides added new content',
        autoResolvable: false,
        suggestedResolution: 'both',
      }
    }
  }

  // 7. One side is empty (deletion vs modification)
  if (ours.trim() === '' && theirs.trim() !== '') {
    return {
      kind: 'OVERLAP',
      reason: 'Ours deleted, theirs modified',
      autoResolvable: false,
    }
  }
  if (theirs.trim() === '' && ours.trim() !== '') {
    return {
      kind: 'OVERLAP',
      reason: 'Theirs deleted, ours modified',
      autoResolvable: false,
    }
  }

  // 8. Default: genuine overlap — needs human decision
  return {
    kind: 'OVERLAP',
    reason: 'Genuine content conflict',
    autoResolvable: false,
  }
}

/**
 * Classify all chunks and return classifications + auto-resolve results.
 * Auto-resolved chunks get their resolution pre-set; others are left for the user.
 */
export function classifyAllConflicts(
  chunks: ConflictChunk[],
): ConflictClassification[] {
  return chunks.map(classifyConflict)
}

/**
 * Generate a smart "BOTH" merge for a chunk based on its classification.
 * Returns custom content if a smarter merge is possible, or null to fall back to plain concatenation.
 */
export function smartBothMerge(chunk: ConflictChunk, classification: ConflictClassification): string | null {
  // For import conflicts, use deduplicated+sorted merge
  if (classification.kind === 'IMPORT' && classification.smartContent) {
    return classification.smartContent
  }

  // For identical/whitespace/trivial — "both" doesn't make sense, just use the suggested side
  if (classification.kind === 'IDENTICAL' || classification.kind === 'WHITESPACE' || classification.kind === 'TRIVIAL') {
    return classification.suggestedResolution === 'theirs' ? chunk.theirsContent : chunk.oursContent
  }

  // For comment-only: merge the more-commented version
  if (classification.kind === 'COMMENT') {
    return classification.suggestedResolution === 'theirs' ? chunk.theirsContent : chunk.oursContent
  }

  // Default: no smart merge available — caller should use plain concatenation
  return null
}
