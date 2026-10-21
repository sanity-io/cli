/**
 * Textual editing of the `fields: [...]` array in a Media Library config
 * app's `sanity.cli.ts`. Powers two flows:
 *
 * - `sanity media pull-aspects` appending the entries it generated, so pulled
 *   fields are declared immediately (an undeclared stored aspect is deleted
 *   by the next deploy — the mirror semantics make registration a safety
 *   concern, not a convenience).
 * - `sanity init --template media-library-config` replacing the example
 *   entries with ones pulled from the organization's existing aspects.
 *
 * The config is arbitrary user TypeScript, so this is conservative by design:
 * a single `unstable_defineMediaLibrary(` call with a single `fields: [...]`
 * array literal is edited in place; anything else returns a reason and the
 * caller falls back to printing paste-ready entries. The array scan is
 * string- and comment-aware, so brackets inside entry titles or comments
 * don't derail it.
 */

export type EditResult = {ok: false; reason: string} | {ok: true; updated: string}

const FIELDS_ARRAY_RE = /\bfields\s*:\s*\[/g

interface LocatedArray {
  /** Index of the matching `]`. */
  close: number
  /** Leading whitespace of the line containing `fields:`. */
  indent: string
  /**
   * Index just past the last content character (not whitespace, not a
   * comment) inside the array — the `[` itself when the array is empty.
   * Appending inserts here so a trailing comment never ends up with a comma
   * after it (which would create a sparse-array hole).
   */
  lastContentEnd: number
  /** Index of the `[`. */
  open: number
}

function locateFieldsArray(source: string): LocatedArray | {reason: string} {
  // Call sites only — the import statement also mentions the identifier.
  const calls = [...source.matchAll(/\bunstable_defineMediaLibrary\s*\(/g)].length
  if (calls === 0) {
    return {reason: 'no `unstable_defineMediaLibrary(...)` call found'}
  }
  if (calls > 1) {
    return {reason: 'more than one `unstable_defineMediaLibrary(...)` call found'}
  }

  const matches = [...source.matchAll(FIELDS_ARRAY_RE)]
  if (matches.length === 0) {
    return {reason: 'no `fields: [...]` array literal found'}
  }
  if (matches.length > 1) {
    return {reason: 'more than one `fields: [...]` array found'}
  }

  const match = matches[0]
  const open = match.index + match[0].length - 1
  const scanned = findMatchingBracket(source, open)
  if (scanned === null) {
    return {reason: 'the `fields` array never closes'}
  }

  const lineStart = source.lastIndexOf('\n', match.index) + 1
  const indent = /^[\t ]*/.exec(source.slice(lineStart, match.index))?.[0] ?? ''

  return {close: scanned.close, indent, lastContentEnd: scanned.lastContentEnd, open}
}

/**
 * The index of the `]` matching the `[` at `open` — plus the index just past
 * the last content character between them — skipping over string literals
 * (including template literals and their `${...}` holes) and comments. `null`
 * when unbalanced.
 */
function findMatchingBracket(
  source: string,
  open: number,
): {close: number; lastContentEnd: number} | null {
  let depth = 0
  // Brace depths of template-literal `${` holes, one per nesting level.
  const templateHoles: number[] = []
  let index = open
  let lastContentEnd = open + 1

  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index)
      if (end === -1) return null
      index = end + 1
      continue
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2)
      if (end === -1) return null
      index = end + 2
      continue
    }
    if (char === "'" || char === '"') {
      index = skipString(source, index, char)
      if (index === -1) return null
      lastContentEnd = index
      continue
    }
    if (char === '`') {
      index = skipTemplateLiteral(source, index, templateHoles)
      if (index === -1) return null
      lastContentEnd = index
      continue
    }
    if (templateHoles.length > 0) {
      if (char === '{') templateHoles[templateHoles.length - 1]++
      if (char === '}') {
        templateHoles[templateHoles.length - 1]--
        if (templateHoles.at(-1) === 0) {
          // The `${...}` hole closed: resume scanning the template literal.
          templateHoles.pop()
          index = skipTemplateLiteral(source, index + 1, templateHoles, true)
          if (index === -1) return null
          lastContentEnd = index
          continue
        }
      }
    }

    if (char === '[') depth++
    if (char === ']') {
      depth--
      if (depth === 0) return {close: index, lastContentEnd}
    }
    if (!/\s/.test(char)) lastContentEnd = index + 1
    index++
  }
  return null
}

/** Index just past the closing quote, or -1. `start` points at the opening quote. */
function skipString(source: string, start: number, quote: string): number {
  for (let index = start + 1; index < source.length; index++) {
    if (source[index] === '\\') {
      index++
      continue
    }
    if (source[index] === quote) return index + 1
    if (source[index] === '\n') return -1 // unterminated
  }
  return -1
}

/**
 * Index just past the closing backtick, or the index *at* the start of a
 * `${` hole's contents after registering it in `templateHoles` (the caller's
 * main loop then balances the hole's braces). `resume` continues a literal
 * whose hole just closed, so `start` is not an opening backtick.
 */
function skipTemplateLiteral(
  source: string,
  start: number,
  templateHoles: number[],
  resume = false,
): number {
  for (let index = resume ? start : start + 1; index < source.length; index++) {
    if (source[index] === '\\') {
      index++
      continue
    }
    if (source[index] === '$' && source[index + 1] === '{') {
      templateHoles.push(1)
      return index + 2
    }
    if (source[index] === '`') return index + 1
  }
  return -1
}

/**
 * Append `entryLines` (one rendered `{name, src, title},` object per line) to
 * the config's `fields` array, preserving the existing entries and adding a
 * trailing comma to the last one when needed.
 */
export function appendFieldEntries(source: string, entryLines: string[]): EditResult {
  const located = locateFieldsArray(source)
  if ('reason' in located) return {ok: false, reason: located.reason}

  const {indent, lastContentEnd, open} = located
  const entryIndent = `${indent}  `
  const block = entryLines.map((line) => entryIndent + line).join('\n')

  if (lastContentEnd === open + 1) {
    const inner = source.slice(open + 1, located.close)
    if (inner.trim() !== '') {
      // Only comments inside: rewriting would silently drop them.
      return {ok: false, reason: 'the `fields` array contains only comments'}
    }
    const updated = `${source.slice(0, open + 1)}\n${block}\n${indent}${source.slice(located.close)}`
    return {ok: true, updated}
  }

  const comma = source[lastContentEnd - 1] === ',' ? '' : ','
  const updated = `${source.slice(0, lastContentEnd)}${comma}\n${block}${source.slice(lastContentEnd)}`
  return {ok: true, updated}
}

/** Replace the config's `fields` array contents with `entryLines` wholesale. */
export function replaceFieldEntries(source: string, entryLines: string[]): EditResult {
  const located = locateFieldsArray(source)
  if ('reason' in located) return {ok: false, reason: located.reason}

  const {close, indent, open} = located
  const entryIndent = `${indent}  `
  const block = entryLines.map((line) => entryIndent + line).join('\n')

  const updated = `${source.slice(0, open + 1)}\n${block}\n${indent}${source.slice(close)}`
  return {ok: true, updated}
}
