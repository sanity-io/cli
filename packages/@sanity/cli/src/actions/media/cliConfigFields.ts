/**
 * Edits the `fields: [...]` array in a Media Library config app's
 * `sanity.cli.ts`. Powers two flows:
 *
 * - `sanity media pull-aspects` appending the entries it generated, so pulled
 *   fields are declared immediately (an undeclared stored aspect is deleted
 *   by the next deploy — the mirror semantics make registration a safety
 *   concern, not a convenience).
 * - `sanity init --template media-library-config` replacing the example
 *   entries with ones pulled from the organization's existing aspects.
 *
 * Parse to locate, splice to edit: vite's `parseAst` (already a runtime
 * dependency of the CLI) finds the one `fields` array literal the deploy will
 * read — the direct property of the single `unstable_defineMediaLibrary({...})`
 * call's config object — and the edit is a string splice at the located
 * offsets, so the user's formatting elsewhere survives byte for byte (a
 * parser-backed *rewrite* would reprint code it did not author).
 *
 * The config is arbitrary user TypeScript, so the contract stays narrow by
 * design: one call, one object literal, one `fields` array literal. Anything
 * else — a computed `fields` value, duplicate keys, code that does not parse —
 * returns a reason and the caller falls back to printing paste-ready entries
 * instead of risking a mis-edit.
 */

import {parseAst} from 'vite'

export type EditResult = {ok: false; reason: string} | {ok: true; updated: string}

const CALL_NAME = 'unstable_defineMediaLibrary'

/**
 * Structural view of the oxc nodes `parseAst` returns (estree-shaped, with
 * UTF-16 `start`/`end` offsets into the source). Declared locally because the
 * full types live in `@oxc-project/types`, a transitive dependency this
 * module only needs a sliver of.
 */
interface AstNode {
  [key: string]: unknown
  end: number
  start: number
  type: string
}

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

function isNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string'
}

/** Depth-first visit of every node in the (sub)tree rooted at `node`. */
function walk(node: AstNode, visit: (node: AstNode) => void): void {
  visit(node)
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) walk(item, visit)
      }
    } else if (isNode(value)) {
      walk(value, visit)
    }
  }
}

/** Non-computed `fields` key — `fields:` or `'fields':`. */
function isFieldsProperty(prop: AstNode): boolean {
  if (prop.type !== 'Property' || prop.computed === true) return false
  const key = prop.key as AstNode
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
  let program: AstNode
  try {
    program = parseAst(source, {lang: 'ts'}) as unknown as AstNode
  } catch {
    return {reason: 'the config does not parse as TypeScript'}
  }

  // The import statement also mentions the identifier, but only call sites
  // show up as CallExpressions.
  const calls: AstNode[] = []
  walk(program, (node) => {
    const callee = node.callee as AstNode | undefined
    if (
      node.type === 'CallExpression' &&
      callee?.type === 'Identifier' &&
      callee.name === CALL_NAME
    ) {
      calls.push(node)
    }
  })
  if (calls.length === 0) {
    return {reason: 'no `unstable_defineMediaLibrary(...)` call found'}
  }
  if (calls.length > 1) {
    return {reason: 'more than one `unstable_defineMediaLibrary(...)` call found'}
  }

  const [config] = calls[0].arguments as AstNode[]
  if (config?.type !== 'ObjectExpression') {
    return {reason: 'the `unstable_defineMediaLibrary(...)` argument is not an object literal'}
  }

  // Only the config object's own `fields` property may be edited — deploy
  // evaluates exactly that one, so a `fields` array nested elsewhere (or
  // sitting in a helper outside the call) must neither be edited nor block
  // the real one.
  const fieldsProps = (config.properties as AstNode[]).filter((prop) => isFieldsProperty(prop))
  if (fieldsProps.length === 0) {
    return {reason: 'no `fields` property in the `unstable_defineMediaLibrary({...})` config'}
  }
  if (fieldsProps.length > 1) {
    return {
      reason: 'more than one `fields` property in the `unstable_defineMediaLibrary({...})` config',
    }
  }

  const fields = fieldsProps[0]
  const array = fields.value as AstNode
  if (array.type !== 'ArrayExpression') {
    // A computed value (`fields: sharedFields`) stays the user's to manage —
    // deploy keeps evaluating it, so an "edit" elsewhere would be a lie.
    return {reason: 'the `fields` value is not an array literal'}
  }

  const open = array.start
  const close = array.end - 1
  const elements = array.elements as (AstNode | null)[]
  const last = elements.at(-1)

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
