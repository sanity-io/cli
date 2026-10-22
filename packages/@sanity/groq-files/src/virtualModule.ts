import {type GroqParam} from './params.js'

const TYPES_MODULE = '@sanity/groq-files/types'
const REFERENCE_SYMBOL = 'internalGroqTypeReferenceTo'
const ARRAY_OF = 'ArrayOf'
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const AST_SKIP_KEYS = new Set([
  'end',
  'innerComments',
  'leadingComments',
  'loc',
  'start',
  'trailingComments',
])

/** A type alias `@sanity/codegen` printed, with the alias names its body refers to. */
export interface GeneratedTypeAlias {
  code: string
  name: string
  references: ReadonlySet<string>
}

export interface VirtualModuleOptions {
  params: readonly GroqParam[]
  query: string

  diagnostics?: string[]
  /** Absent when the query could not be typed. The module then resolves to `unknown`. */
  result?: GeneratedTypeAlias
  schemaTypes?: readonly GeneratedTypeAlias[]
}

/**
 * The TypeScript a `.groq` import resolves to.
 *
 * The only value export is `default`, the query string literal typed as `GroqQuery` so it
 * carries `Result` and `Params` with it. Those two are also exported as types. Schema types are
 * module-local, and only those the result refers to are included, so a projection query carries
 * no schema at all. Nothing is declared globally.
 */
export function renderVirtualModule(options: VirtualModuleOptions): string {
  const notes = (options.diagnostics ?? []).map(
    (message) => `// ${message.replaceAll('\n', '\n// ')}`,
  )
  const params =
    options.params.length === 0
      ? 'Record<string, never>'
      : `{${options.params.map((param) => `${propertyKey(param.name)}: ${param.type}`).join(', ')}}`
  const result = options.result?.name
  const included = options.result
    ? includeReferenced(options.result, options.schemaTypes ?? [])
    : {aliases: [], needsArrayOf: false, needsReferenceSymbol: false}

  const lines: string[] = []
  if (notes.length > 0) lines.push(...notes)
  lines.push(
    `import {type GroqQuery${included.needsReferenceSymbol ? `, ${REFERENCE_SYMBOL}` : ''}} from ${JSON.stringify(TYPES_MODULE)}`,
    '',
  )
  if (included.needsArrayOf) lines.push('type ArrayOf<T> = Array<T & {_key: string}>', '')
  for (const alias of included.aliases) lines.push(unexport(alias.code), '')
  if (options.result) lines.push(unexport(options.result.code), '')
  lines.push(
    `type Params = ${params}`,
    `type Result = ${result ?? 'unknown'}`,
    `declare const query: GroqQuery<${JSON.stringify(options.query)}, Result, Params>`,
    'export default query',
    'export type {Params, Result}',
    '',
  )
  return lines.join('\n')
}

/**
 * Names a codegen type alias body refers to. Property keys are skipped unless computed, which
 * is how the reference symbol appears.
 */
export function collectTypeReferences(node: unknown): Set<string> {
  const names = new Set<string>()
  visit(node, names)
  return names
}

function visit(node: unknown, names: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) visit(item, names)
    return
  }
  if (typeof node !== 'object' || node === null) return
  const record = node as Record<string, unknown>
  if (record.type === 'Identifier' && typeof record.name === 'string') {
    names.add(record.name)
    return
  }
  const skipKey =
    (record.type === 'TSPropertySignature' || record.type === 'TSMethodSignature') &&
    record.computed !== true
  for (const [key, value] of Object.entries(record)) {
    if (AST_SKIP_KEYS.has(key)) continue
    if (skipKey && key === 'key') continue
    visit(value, names)
  }
}

function includeReferenced(
  result: GeneratedTypeAlias,
  schemaTypes: readonly GeneratedTypeAlias[],
): {aliases: GeneratedTypeAlias[]; needsArrayOf: boolean; needsReferenceSymbol: boolean} {
  const byName = new Map(schemaTypes.map((alias) => [alias.name, alias]))
  const seen = new Set<string>()
  const queue = [...result.references]
  let needsArrayOf = false
  let needsReferenceSymbol = false

  while (queue.length > 0) {
    const name = queue.shift()
    if (name === undefined || seen.has(name)) continue
    seen.add(name)
    if (name === ARRAY_OF) needsArrayOf = true
    if (name === REFERENCE_SYMBOL) needsReferenceSymbol = true
    const alias = byName.get(name)
    if (alias) queue.push(...alias.references)
  }

  return {
    aliases: schemaTypes.filter((alias) => seen.has(alias.name)),
    needsArrayOf,
    needsReferenceSymbol,
  }
}

function unexport(code: string): string {
  return code.replace(/^export (?=(?:declare |type |interface ))/m, '').trimEnd()
}

function propertyKey(name: string): string {
  return IDENTIFIER.test(name) ? name : JSON.stringify(name)
}
