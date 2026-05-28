// eslint-disable-next-line import-x/no-unresolved
import {init, parse} from 'cjs-module-lexer'

/** Memoizes the (Wasm) lexer initialization across calls. */
let lexerReady: Promise<void> | undefined

/**
 * Matches a string that can be used both as `export const <name>` and
 * `import {<name>}`. Names that fail this (reserved words, string-literal export
 * names) are not importable by name, so they are safely skipped.
 */
const VALID_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/**
 * Statically extracts the named exports of a CommonJS module source, without
 * executing it, using `cjs-module-lexer` (the same detector Node.js core uses
 * to expose CommonJS named exports to ESM importers).
 *
 * The vendor build uses this to learn which named bindings each CommonJS entry
 * must re-expose as real ESM exports once Rolldown has lowered it to ESM (see
 * `createVendorNamedExportsPlugin`). Executing the module is intentionally
 * avoided so that bundles which touch DOM globals at evaluation time (e.g.
 * `react-dom`) cannot break the build.
 *
 * @param source - The CommonJS module source code.
 * @param label - Identifier used in error messages (e.g. the chunk name).
 * @returns De-duplicated, importable identifier names, excluding `default` and
 *   `__esModule`.
 * @throws If the module re-exports another module (`module.exports = require(...)`);
 *   transitive re-export resolution is not supported by the vendor build.
 * @internal
 */
export async function getCjsNamedExports(source: string, label: string): Promise<string[]> {
  lexerReady ??= init()
  await lexerReady

  const {exports, reexports} = parse(source)

  if (reexports.length > 0) {
    throw new Error(
      `Unexpected CommonJS re-exports in '${label}': ${reexports.join(', ')}. ` +
        `Transitive re-export resolution is not supported by the vendor build.`,
    )
  }

  return [...new Set(exports)].filter(
    (name) => name !== 'default' && name !== '__esModule' && VALID_IDENTIFIER.test(name),
  )
}
