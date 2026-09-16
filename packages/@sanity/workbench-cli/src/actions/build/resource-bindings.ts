/**
 * Resource bindings ride in a dedicated module in the app's bundle rather than an
 * index.html script tag, so both standalone studios and federated apps resolve
 * them the same way (a federated host pulls modules, not HTML).
 *
 * The module is emitted at a stable, unhashed path (`sanity-resource-bindings.js`)
 * at the bundle root and is statically imported first, so it is evaluated before
 * any app code. At deploy time Brett replaces the `__SANITY_RESOURCE_BINDINGS__`
 * token with the resolved bindings JSON. The token is invalid JSON on purpose: a
 * minifier can't constant-fold `JSON.parse` of it, so the call — and the token —
 * survive minification for Brett to rewrite.
 *
 * These constants are the single source of truth shared by the standalone studio
 * build (`@sanity/cli-build`) and the federated app build here. They must stay in
 * lockstep with Brett's replacement (see SDK-2413).
 */

/** Rolldown chunk name used to force the bindings module into its own chunk. */
export const RESOURCE_BINDINGS_CHUNK_NAME = 'sanity-resource-bindings'

/** Stable, unhashed file name Brett looks for at the bundle root. */
export const RESOURCE_BINDINGS_FILENAME = `${RESOURCE_BINDINGS_CHUNK_NAME}.js`

/** Token Brett replaces with the resolved bindings JSON at deploy. */
export const RESOURCE_BINDINGS_TOKEN = '__SANITY_RESOURCE_BINDINGS__'

/**
 * Contents of the generated bindings module. The `JSON.parse` result is assigned
 * to a global so the module has an observable side effect and isn't tree-shaken
 * when nothing imports its export yet (the reader lands in SDK-2295). The
 * try/catch keeps a local, un-deployed build (e.g. `sanity preview`) working: an
 * unreplaced token throws, and we fall back to an empty array.
 */
export const RESOURCE_BINDINGS_MODULE_SOURCE = `// This file is auto-generated on 'sanity build' / 'sanity dev'
// Modifications to this file are automatically discarded
let resourceBindings = []
try {
  resourceBindings = JSON.parse('${RESOURCE_BINDINGS_TOKEN}')
} catch {
  // Built but not deployed through Brett (e.g. local preview): keep the default.
}
globalThis.${RESOURCE_BINDINGS_TOKEN} = resourceBindings
export {resourceBindings}
`

/** Side-effect import placed first in each entry so the module evaluates before app code. */
export const RESOURCE_BINDINGS_ENTRY_IMPORT = `import './${RESOURCE_BINDINGS_FILENAME}'`

/**
 * Rolldown `codeSplitting` group that isolates the bindings module into its own
 * chunk. `minSize`/`minModuleSize` of 0 are scoped to this group (not the
 * enclosing `codeSplitting` object) so they only affect the bindings module and
 * never the automatic chunking of everything else. They stop Rolldown folding
 * the tiny module back into its importer.
 */
export const resourceBindingsCodeSplittingGroup = {
  minModuleSize: 0,
  minSize: 0,
  name: RESOURCE_BINDINGS_CHUNK_NAME,
  test: new RegExp(RESOURCE_BINDINGS_CHUNK_NAME),
}

/**
 * `chunkFileNames` value for the bindings chunk (unhashed, at the bundle root),
 * or `undefined` for any other chunk so the caller can apply its own default.
 */
export function resourceBindingsChunkFileName(chunkName: string): string | undefined {
  return chunkName === RESOURCE_BINDINGS_CHUNK_NAME ? RESOURCE_BINDINGS_FILENAME : undefined
}
