/**
 * Locates and edits the `fields: [...]` array in a Media Library config app's
 * `sanity.cli.ts` — appending entries (`sanity media pull-aspects`) or
 * replacing them (the init-time pull). Deploying mirrors the declared fields
 * into the library and deletes stored aspects left undeclared, so unsafe
 * edits are refused rather than risked: the AST (vite's `parseAst`) locates
 * the one array literal the deploy will read, the edit is a byte-preserving
 * splice at its offsets, and any other shape returns a reason the caller
 * turns into a paste-ready fallback.
 */

import {type CallExpression, type ObjectProperty, type ObjectPropertyKind} from '@oxc-project/types'
import {parseAst} from 'vite'

export type EditResult = {ok: false; reason: string} | {ok: true; updated: string}

const CALL_NAME = 'unstable_defineMediaLibrary'

interface LocatedArray {
  /** Index of the `]`. */
  close: number
  /** Leading whitespace of the line containing the `fields` property. */
  indent: string
  /**
   * Index just past the last element — past its trailing comma when there is
   * one — or `open + 1` for an empty array. Appending inserts here, so a
   * trailing comment never ends up with a comma after it (which would create
   * a sparse-array hole).
   */
  lastContentEnd: number
  /** Index of the `[`. */
  open: number
}

/**
 * Depth-first collection of every `unstable_defineMediaLibrary(...)` call in
 * the (sub)tree at `value`. The one cast is guarded by the `type`
 * discriminant it narrows on.
 */
function collectCalls(value: unknown, calls: CallExpression[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectCalls(item, calls)
    return
  }
  if (typeof value !== 'object' || value === null) return
  if ((value as {type?: unknown}).type === 'CallExpression') {
    const call = value as CallExpression
    if (call.callee.type === 'Identifier' && call.callee.name === CALL_NAME) {
      calls.push(call)
    }
  }
  for (const child of Object.values(value)) {
    if (typeof child === 'object') collectCalls(child, calls)
  }
}

/** Non-computed `fields` key — `fields:` or `'fields':`. */
function isFieldsProperty(prop: ObjectPropertyKind): prop is ObjectProperty {
  if (prop.type !== 'Property' || prop.computed) return false
  const {key} = prop
  return (
    (key.type === 'Identifier' && key.name === 'fields') ||
    (key.type === 'Literal' && key.value === 'fields')
  )
}

/**
 * The index of the `,` between a trailing array element ending at `from` and
 * the `]` at `to`, or -1 when the element has no trailing comma. Only
 * whitespace, comments, and at most one comma can sit in that gap, and the
 * comments terminate (the source parsed), so this scan just has to not read a
 * comma out of a comment.
 */
function indexOfTrailingComma(source: string, from: number, to: number): number {
  let index = from
  while (index < to) {
    const char = source[index]
    if (char === ',') return index
    if (char === '/' && source[index + 1] === '/') {
      const newline = source.indexOf('\n', index)
      if (newline === -1 || newline >= to) return -1
      index = newline + 1
      continue
    }
    if (char === '/' && source[index + 1] === '*') {
      index = source.indexOf('*/', index + 2) + 2
      continue
    }
    index++
  }
  return -1
}

function locateFieldsArray(source: string): LocatedArray | {reason: string} {
  // Node offsets are UTF-16 string indices, so splicing `source` with them is
  // exact even around non-ASCII content.
  let program: ReturnType<typeof parseAst>
  try {
    program = parseAst(source, {lang: 'ts'})
  } catch {
    return {reason: 'the config does not parse as TypeScript'}
  }

  // The import statement also mentions the identifier, but only call sites
  // show up as CallExpressions.
  const calls: CallExpression[] = []
  collectCalls(program.body, calls)
  if (calls.length === 0) {
    return {reason: 'no `unstable_defineMediaLibrary(...)` call found'}
  }
  if (calls.length > 1) {
    return {reason: 'more than one `unstable_defineMediaLibrary(...)` call found'}
  }

  const [config] = calls[0].arguments
  if (config?.type !== 'ObjectExpression') {
    return {reason: 'the `unstable_defineMediaLibrary(...)` argument is not an object literal'}
  }

  // Only the config object's own `fields` property may be edited — deploy
  // evaluates exactly that one, so a `fields` array nested elsewhere (or
  // sitting in a helper outside the call) must neither be edited nor block
  // the real one.
  const fieldsProps = config.properties.filter((prop) => isFieldsProperty(prop))
  if (fieldsProps.length === 0) {
    return {reason: 'no `fields` property in the `unstable_defineMediaLibrary({...})` config'}
  }
  if (fieldsProps.length > 1) {
    return {
      reason: 'more than one `fields` property in the `unstable_defineMediaLibrary({...})` config',
    }
  }

  const fields = fieldsProps[0]
  const array = fields.value
  if (array.type !== 'ArrayExpression') {
    // A computed value (`fields: sharedFields`) stays the user's to manage —
    // deploy keeps evaluating it, so an "edit" elsewhere would be a lie.
    return {reason: 'the `fields` value is not an array literal'}
  }

  const open = array.start
  const close = array.end - 1
  const last = array.elements.at(-1)

  if (last === null) {
    return {reason: 'the `fields` array ends in an elision'}
  }

  let lastContentEnd = open + 1
  if (last) {
    const comma = indexOfTrailingComma(source, last.end, close)
    lastContentEnd = comma === -1 ? last.end : comma + 1
  }

  const lineStart = source.lastIndexOf('\n', fields.start) + 1
  const indent = /^[\t ]*/.exec(source.slice(lineStart, fields.start))?.[0] ?? ''

  return {close, indent, lastContentEnd, open}
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
