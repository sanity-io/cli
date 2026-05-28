/**
 * Minimal subset of the `magic-string` / Rolldown native `RolldownMagicString`
 * API used by {@link injectNamedExports}. Both the JS `magic-string` package and
 * Rolldown's native MagicString satisfy this, so the same logic runs in
 * production (native, via `renderChunk`'s `meta.magicString`) and in unit tests
 * (the JS implementation).
 */
interface MagicStringLike {
  append(content: string): unknown
  overwrite(start: number, end: number, content: string): unknown
  prepend(content: string): unknown
  toString(): string
}

/** A node with source-span offsets (every oxc/ESTree node). */
interface SpanNode {
  end: number
  start: number
  type: string
}

/** `Identifier` (`name`) or string-literal (`value`) module export name. */
interface ModuleExportName extends SpanNode {
  name?: string
  value?: string
}

interface ExportSpecifierNode extends SpanNode {
  exported: ModuleExportName
  local: ModuleExportName
  type: 'ExportSpecifier'
}

interface ExportDefaultDeclarationNode extends SpanNode {
  declaration: SpanNode
  type: 'ExportDefaultDeclaration'
}

interface ExportNamedDeclarationNode extends SpanNode {
  source: (SpanNode & {value?: string}) | null
  specifiers: ExportSpecifierNode[]
  type: 'ExportNamedDeclaration'
}

/**
 * Structural shape of a parsed program, compatible with both `this.parse` (the
 * Rolldown plugin context) and Vite's exported `parseAst`.
 */
interface ProgramLike {
  body: ReadonlyArray<SpanNode>
}

interface InjectNamedExportsOptions {
  /** Chunk name, used in error messages. */
  chunkName: string
  /** Names already exported by the chunk (`chunk.exports`). */
  exports: readonly string[]
  /** The chunk's MagicString instance, edited in place. */
  magicString: MagicStringLike
  /** Target named exports to ensure exist (from `getCjsNamedExports`). */
  names: readonly string[]
  /** Parsed AST of the chunk code (`this.parse(code)` / `parseAst(code)`). */
  program: ProgramLike
}

/** Base name for the local binding that captures the chunk's default export. */
const DEFAULT_LOCAL = '__sanityVendorDefault'

/** Resolves a `ModuleExportName` (identifier or string-literal) to its string. */
function moduleExportName(node: ModuleExportName): string {
  return node.type === 'Literal' ? String(node.value) : String(node.name)
}

/**
 * Picks a local binding name that does not already exist as a word in `code`,
 * suffixing with a counter on the (extremely unlikely) chance of a collision.
 */
function pickLocalName(code: string): string {
  if (!new RegExp(String.raw`\b${DEFAULT_LOCAL}\b`).test(code)) {
    return DEFAULT_LOCAL
  }
  let suffix = 2
  while (new RegExp(String.raw`\b${DEFAULT_LOCAL}${suffix}\b`).test(code)) {
    suffix++
  }
  return `${DEFAULT_LOCAL}${suffix}`
}

/**
 * Rewrites a rendered Rolldown chunk in place so that, alongside its
 * `export default` (the wrapped CommonJS `module.exports`), it also exposes
 * `names` as real ESM named exports.
 *
 * Rolldown lowers a CommonJS entry to an ESM chunk that only emits a default
 * export; it does not synthesize the `exports.foo = ...` assignments as named
 * ESM exports. Since the vendored `.mjs` files are loaded directly by the
 * browser via an import map, a named import such as `useState` from `react` is
 * a live binding lookup that fails without this. We capture the default value
 * into a local binding and append one `export const` per missing name, each
 * reading the matching property off that local.
 *
 * Two emitted default-export shapes are handled: an inline default expression
 * (rewritten to capture it into the local), and a default re-exported from
 * another chunk (imported under the local). Any other shape throws.
 *
 * @throws If the default export cannot be located, or a targeted name cannot be
 *   satisfied. Failing loud turns Rolldown codegen drift (e.g. on a Vite bump)
 *   into a build error instead of a runtime missing-named-export crash.
 * @internal
 */
export function injectNamedExports({
  chunkName,
  exports: existingExports,
  magicString,
  names,
  program,
}: InjectNamedExportsOptions): void {
  const existing = new Set(existingExports)
  const namesToAdd = names.filter((name) => !existing.has(name))

  if (namesToAdd.length === 0) {
    return
  }

  const local = pickLocalName(magicString.toString())

  let inlineDefault: ExportDefaultDeclarationNode | undefined
  let reexportedDefault:
    | {node: ExportNamedDeclarationNode; specifier: ExportSpecifierNode}
    | undefined

  for (const node of program.body) {
    if (node.type === 'ExportDefaultDeclaration') {
      inlineDefault = node as ExportDefaultDeclarationNode
      break
    }

    if (node.type === 'ExportNamedDeclaration') {
      const named = node as ExportNamedDeclarationNode
      const specifier = named.source
        ? named.specifiers.find((spec) => moduleExportName(spec.exported) === 'default')
        : undefined
      if (specifier) {
        reexportedDefault = {node: named, specifier}
      }
    }
  }

  const namedExportLines = namesToAdd.map((name) => `export const ${name} = ${local}.${name}`)

  if (inlineDefault) {
    // Shape A: `export default <expr>;` -> `const <local> = <expr>;`
    magicString.overwrite(inlineDefault.start, inlineDefault.declaration.start, `const ${local} = `)
    magicString.append(`\nexport default ${local}\n${namedExportLines.join('\n')}\n`)
  } else if (reexportedDefault) {
    // Shape B: `export { x as default } from '<source>';` (kept as-is)
    const source = String(reexportedDefault.node.source?.value)
    const imported = moduleExportName(reexportedDefault.specifier.local)
    const importStatement =
      imported === 'default'
        ? `import ${local} from ${JSON.stringify(source)}`
        : `import {${imported} as ${local}} from ${JSON.stringify(source)}`
    magicString.prepend(`${importStatement}\n`)
    magicString.append(`\n${namedExportLines.join('\n')}\n`)
  } else {
    throw new Error(
      `[vendor-named-exports] Could not locate the default export of chunk '${chunkName}' ` +
        `to attach named exports (${namesToAdd.join(', ')}). The Rolldown output shape may have changed.`,
    )
  }

  // Fail loud if any targeted name was not satisfied (existing export or appended).
  const ensured = new Set([...existing, ...namesToAdd])
  const missing = names.filter((name) => !ensured.has(name))
  if (missing.length > 0) {
    throw new Error(
      `[vendor-named-exports] Failed to expose named export(s) on chunk '${chunkName}': ${missing.join(', ')}.`,
    )
  }
}
