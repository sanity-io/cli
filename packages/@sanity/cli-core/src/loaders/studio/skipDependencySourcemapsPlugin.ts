import {readFile} from 'node:fs/promises'

import {type Plugin} from 'vite'

const DEPENDENCY_SCRIPT_RE = /[\\/]node_modules[\\/].+\.[cm]?js$/
// Mirrors the `//# sourceMappingURL=` form Vite itself strips (via `convert-source-map`)
const SOURCEMAP_COMMENT_RE = /^[ \t]*\/\/[#@][ \t]+sourceMappingURL=[^\s'"`]+[ \t]*$/gm

/**
 * Loads plain JavaScript files from `node_modules` without their source maps.
 *
 * The studio worker runs every dependency through Vite's SSR transform
 * (`ssr.noExternal: true`). By default Vite reads each dependency's `.js.map`,
 * combines it with the SSR transform's own map, inlines the result as a base64
 * comment and the module runner then has Node parse it again for stack traces.
 * For a studio that imports `sanity` this means thousands of modules and tens of
 * megabytes of source maps, which roughly doubles the worker's peak memory.
 *
 * Returning `map: {mappings: ''}` from `load` tells Vite there is no source map
 * to preserve, so none of that work happens for dependencies. User code (the
 * studio config, schema files, plugins outside `node_modules`) keeps full source
 * maps. Stack frames inside dependencies still name the file, through a
 * `sourceURL` comment, but their line numbers refer to the transformed code.
 *
 * @internal
 */
export function skipDependencySourcemapsPlugin(): Plugin {
  return {
    // Run after other plugins' `load` hooks so user plugins can still claim these files
    enforce: 'post',
    async load(id) {
      if (id.startsWith('\0') || id.includes('?') || !DEPENDENCY_SCRIPT_RE.test(id)) {
        return null
      }

      let code: string
      try {
        code = await readFile(id, 'utf8')
      } catch {
        // Let Vite's own loader produce its usual error
        return null
      }

      return {
        code: `${code.replaceAll(SOURCEMAP_COMMENT_RE, '')}\n//# sourceURL=${id.replaceAll(/\s/g, encodeURIComponent)}\n`,
        map: {mappings: ''},
      }
    },
    name: 'sanity:studio-worker-skip-dependency-sourcemaps',
  }
}
