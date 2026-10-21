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
 * a single `unstable_defineMediaLibrary(` call containing a single
 * `fields: [...]` array literal is edited in place; anything else returns a
 * reason and the caller falls back to printing paste-ready entries. All
 * matching happens on a masked copy of the source — comments and string /
 * template-literal contents blanked out, indices preserved — so a
 * commented-out `fields: [`, a call name mentioned in a string, or brackets
 * inside entry titles can neither derail the scan nor get edited by mistake.
 *
 * Deliberately textual rather than AST-based: the CLI ships neither
 * jscodeshift nor typescript as runtime dependencies (`sanity codemod` runs
 * jscodeshift through npx on demand — a network fetch that has no place in
 * the middle of `init`), and a parser-backed rewrite reprints code it did not
 * author, while a splice preserves the user's formatting byte for byte. The
 * cost is the narrow contract above — edit the one canonical shape, refuse
 * everything else — which is also what keeps new config shapes safe: they
 * fall back to printed entries instead of a mis-edit.
 */

export type EditResult = {ok: false; reason: string} | {ok: true; updated: string}

const CALL_RE = /\bunstable_defineMediaLibrary\s*\(/g
const FIELDS_ARRAY_RE = /\bfields\s*:\s*\[/g

interface LocatedArray {
  /** Index of the matching `]`. */
  close: number
  /** Leading whitespace of the line containing `fields:`. */
  indent: string
  /**
   * Index just past the last content character (not whitespace, not a
   * comment) inside the array — `open + 1` when there is none. Appending
   * inserts here so a trailing comment never ends up with a comma after it
   * (which would create a sparse-array hole).
   */
  lastContentEnd: number
  /** Index of the `[`. */
  open: number
}

function locateFieldsArray(source: string): LocatedArray | {reason: string} {
  const masked = maskNonCode(source)
  if (masked === null) {
    return {reason: 'unterminated comment, string, or template literal'}
  }

  // The import statement also mentions the identifier, but `(` only follows
  // at call sites; comments/strings are already blanked in `masked`.
  const calls = [...masked.matchAll(CALL_RE)]
  if (calls.length === 0) {
    return {reason: 'no `unstable_defineMediaLibrary(...)` call found'}
  }
  if (calls.length > 1) {
    return {reason: 'more than one `unstable_defineMediaLibrary(...)` call found'}
  }

  // Only a `fields` array between the call's parentheses may be edited — one
  // outside (a helper, say) next to a computed `fields:` value inside would
  // otherwise be rewritten while deploy keeps evaluating the computed one.
  const callOpen = calls[0].index + calls[0][0].length - 1
  const callClose = findMatchingDelimiter(masked, callOpen, '(', ')')
  if (callClose === null) {
    return {reason: 'the `unstable_defineMediaLibrary(...)` call never closes'}
  }

  const matches = [...masked.slice(0, callClose).matchAll(FIELDS_ARRAY_RE)].filter(
    (match) => match.index > callOpen,
  )
  if (matches.length === 0) {
    return {
      reason:
        'no `fields: [...]` array literal found in the `unstable_defineMediaLibrary(...)` call',
    }
  }
  if (matches.length > 1) {
    return {
      reason:
        'more than one `fields: [...]` array found in the `unstable_defineMediaLibrary(...)` call',
    }
  }

  const match = matches[0]
  const open = match.index + match[0].length - 1
  const close = findMatchingDelimiter(masked, open, '[', ']')
  if (close === null) {
    return {reason: 'the `fields` array never closes'}
  }

  // Comments are spaces in `masked`, so the last non-whitespace character
  // before `]` is real content (string delimiters survive masking).
  let last = close - 1
  while (last > open && /\s/.test(masked[last])) last--
  const lastContentEnd = last === open ? open + 1 : last + 1

  const lineStart = source.lastIndexOf('\n', match.index) + 1
  const indent = /^[\t ]*/.exec(source.slice(lineStart, match.index))?.[0] ?? ''

  return {close, indent, lastContentEnd, open}
}

/**
 * A copy of `source` with comments and the contents of string / template
 * literals blanked to spaces — same length, same indices, newlines kept.
 * Comments vanish delimiters and all; string and template delimiters stay (so
 * "last content" scans still see where a literal ends); code inside template
 * `${...}` holes is preserved. `null` when a comment or literal never
 * terminates.
 */
function maskNonCode(source: string): string | null {
  // Brace depths of template-literal `${` holes, one per nesting level.
  const templateHoles: number[] = []

  // Collected left-to-right by the scan, non-overlapping; applied at the end.
  // (Not a char array: that would split surrogate pairs or, with spread, use
  // code points and break the index alignment this whole function is for.)
  const blankedRanges: Array<[number, number]> = []
  const blank = (from: number, to: number) => {
    if (to > from) blankedRanges.push([from, to])
  }

  /**
   * Blank a template literal's text starting at `from` (just past a backtick
   * or a hole's `}`): up to its closing backtick, or up to the `${` of the
   * next hole after registering it. Returns the index to resume scanning at.
   */
  const blankTemplateText = (from: number): number => {
    const end = skipTemplateLiteral(source, from - 1, templateHoles)
    if (end === -1) return -1
    const viaHole = source[end - 1] === '{' && source[end - 2] === '$'
    blank(from, viaHole ? end - 2 : end - 1)
    return end
  }

  let index = 0
  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    if (char === '/' && next === '/') {
      const newline = source.indexOf('\n', index)
      const end = newline === -1 ? source.length : newline
      blank(index, end)
      index = end
      continue
    }
    if (char === '/' && next === '*') {
      const terminator = source.indexOf('*/', index + 2)
      if (terminator === -1) return null
      blank(index, terminator + 2)
      index = terminator + 2
      continue
    }
    if (char === "'" || char === '"') {
      const end = skipString(source, index, char)
      if (end === -1) return null
      blank(index + 1, end - 1)
      index = end
      continue
    }
    if (char === '`') {
      index = blankTemplateText(index + 1)
      if (index === -1) return null
      continue
    }
    if (templateHoles.length > 0) {
      if (char === '{') templateHoles[templateHoles.length - 1]++
      if (char === '}') {
        templateHoles[templateHoles.length - 1]--
        if (templateHoles.at(-1) === 0) {
          // The `${...}` hole closed: resume blanking the template literal.
          templateHoles.pop()
          index = blankTemplateText(index + 1)
          if (index === -1) return null
          continue
        }
      }
    }
    index++
  }

  let masked = ''
  let cursor = 0
  for (const [from, to] of blankedRanges) {
    masked += source.slice(cursor, from) + source.slice(from, to).replaceAll(/[^\n]/g, ' ')
    cursor = to
  }
  return masked + source.slice(cursor)
}

/**
 * The index of the `closeChar` matching the `openChar` at `open`, by plain
 * depth counting — `masked` has no comments or literal contents left to trap
 * it. `null` when unbalanced.
 */
function findMatchingDelimiter(
  masked: string,
  open: number,
  openChar: string,
  closeChar: string,
): number | null {
  let depth = 0
  for (let index = open; index < masked.length; index++) {
    if (masked[index] === openChar) depth++
    if (masked[index] === closeChar) {
      depth--
      if (depth === 0) return index
    }
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
 * Scan template-literal text whose delimiter (the opening backtick, or the
 * `}` closing a hole) sits at `start`. Returns the index just past the
 * closing backtick, or the index *at* the start of a `${` hole's contents
 * after registering it in `templateHoles` (the caller's main loop then
 * balances the hole's braces). -1 when unterminated.
 */
function skipTemplateLiteral(source: string, start: number, templateHoles: number[]): number {
  for (let index = start + 1; index < source.length; index++) {
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
