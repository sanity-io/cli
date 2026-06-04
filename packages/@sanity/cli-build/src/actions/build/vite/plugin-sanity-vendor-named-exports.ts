import {type Plugin} from 'vite'

import {injectNamedExports} from './injectNamedExports.js'

/**
 * Creates a Vite (Rolldown) plugin for the vendor build that ensures each
 * emitted CommonJS-derived entry chunk (`react`, `react-dom`, and friends)
 * exposes real ESM named exports in addition to its `export default`.
 *
 * ## Why
 * Vite 8 bundles with Rolldown, which lowers a CommonJS entry to an ESM chunk
 * that only emits a default export (the wrapped `module.exports`); it does not
 * re-emit the `exports.foo = ...` assignments as named ESM exports. The
 * vendored `.mjs` files are loaded directly by the browser via an import map,
 * so a named import such as `useState` from `react` is a live binding lookup
 * that crashes without them.
 *
 * ## Why this approach
 * Vite 8 no longer ships `@rollup/plugin-commonjs` (its `commonjsOptions` are a
 * no-op), and adding it back deadlocks under Rolldown — it relies on
 * `syntheticNamedExports` and `this.load()` in `transform`, which Rolldown does
 * not support. A generated proxy-entry module was the other option; instead we
 * complete the transform on the real emitted chunk: in `renderChunk` we parse
 * the output with `this.parse` and append the named exports using the native
 * MagicString (`meta.magicString`, enabled via `experimental.nativeMagicString`
 * on the vendor build).
 *
 * @param namesByChunkName - Map of entry chunk name (e.g. `react/index`) to the
 *   named exports its CommonJS source declares (see `getCjsNamedExports`).
 * @internal
 */
export function createVendorNamedExportsPlugin(
  namesByChunkName: Record<string, readonly string[]>,
): Plugin {
  return {
    apply: 'build',
    name: 'sanity/vendor-named-exports',

    renderChunk(code, chunk, _outputOptions, meta) {
      const names = chunk.isEntry ? namesByChunkName[chunk.name] : undefined
      if (!names || names.length === 0) {
        return null
      }

      const {magicString} = meta
      if (!magicString) {
        throw new Error(
          `[vendor-named-exports] Native MagicString unavailable while rendering chunk '${chunk.name}'. ` +
            `Ensure 'experimental.nativeMagicString' is enabled for the vendor build.`,
        )
      }

      injectNamedExports({
        chunkName: chunk.name,
        exports: chunk.exports,
        magicString,
        names,
        program: this.parse(code),
      })

      return magicString
    },
  }
}
