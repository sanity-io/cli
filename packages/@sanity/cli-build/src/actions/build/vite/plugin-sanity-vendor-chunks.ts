// Builds react, react-dom and styled-components as hashed ESM chunks in `vendor/` for the
// `index.html` import map. Emitted, not `input`: module federation bootstraps every input as an app.
import {esmExternalRequirePlugin, type Plugin} from 'vite'

import {type AutoUpdatesBuildConfig} from '../autoUpdates.js'
import {VENDOR_DIR} from '../constants.js'
import {createExternalFromImportMap} from '../createExternalFromImportMap.js'
import {createVendorNamedExportsPlugin} from './plugin-sanity-vendor-named-exports.js'

export function sanityVendorChunks({imports, vendor}: AutoUpdatesBuildConfig): Plugin {
  return {
    applyToEnvironment: (env) =>
      env.name === 'client' && [
        // Re-expose CommonJS named exports (react, react-dom) as real ESM exports
        // on the emitted vendor chunks; Rolldown only emits `export default` for a
        // CommonJS entry.
        createVendorNamedExportsPlugin(vendor.namesByChunkName),
        // The import map and vendor specifiers are externals of the studio/app
        // bundle, resolved by the browser at runtime. They are handed to
        // `esmExternalRequirePlugin` rather than `rolldownOptions.external`: the
        // plugin both marks them external AND rewrites bundled CommonJS
        // `require()` calls of an external (e.g. react-dom requiring react) into
        // ESM imports, while `rolldownOptions.external` would short-circuit that
        // rewrite and leave a runtime `require` shim that throws in the browser.
        esmExternalRequirePlugin({
          external: createExternalFromImportMap({
            imports: {
              ...imports,
              ...Object.fromEntries(
                Object.values(vendor.specifiersByChunkName).map((specifier) => [specifier, '']),
              ),
            },
          }),
        }),
        {
          buildStart() {
            for (const [name, id] of Object.entries(vendor.entries)) {
              this.emitFile({id, name, type: 'chunk'})
            }
          },
          name: 'sanity/vendor-chunk-entries',
          outputOptions: ({chunkFileNames = 'static/[name]-[hash].js', ...options}) => ({
            ...options,
            chunkFileNames: (chunk) => {
              if (chunk.name in vendor.entries) return `${VENDOR_DIR}/[name]-[hash].mjs`

              return typeof chunkFileNames === 'function' ? chunkFileNames(chunk) : chunkFileNames
            },
            exports: 'named',
          }),
        },
      ],
    configEnvironment: (name) =>
      name === 'client'
        ? {
            build: {
              rolldownOptions: {
                // Expose Rolldown's native MagicString on `renderChunk`'s `meta` so
                // the vendor named-exports plugin can edit chunks without a JS
                // dependency.
                experimental: {nativeMagicString: true},
                // App-style builds default to `preserveEntrySignatures: false`, which
                // treeshakes the exports off entry chunks. Vendor chunks are loaded by
                // the browser via the import map, so their exports must survive (e.g.
                // styled-components' native ESM exports). `exports-only` keeps exports
                // for entries that have them, while the export-less `sanity` app entry
                // still bundles as before.
                preserveEntrySignatures: 'exports-only',
              },
            },
          }
        : undefined,
    name: 'sanity/vendor-chunks',
  }
}
