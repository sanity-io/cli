import {readFile} from 'node:fs/promises'

import {type Plugin} from 'vite'

const DEPENDENCY_SCRIPT_RE = /[\\/]node_modules[\\/].+\.[cm]?js$/

/**
 * Loads plain JavaScript files from `node_modules` without their source maps.
 *
 * The studio worker runs dependencies that aren't loaded natively (third-party
 * plugins, or every dependency when
 * `SANITY_CLI_STUDIO_WORKER_INLINE_DEPENDENCIES` is set) through Vite's SSR
 * transform. By default Vite reads each dependency's `.js.map`, combines it with
 * the SSR transform's own map, inlines the result as a base64 comment and the
 * module runner then has Node parse it again for stack traces. For a studio
 * whose dependencies all go through Vite this means thousands of modules and
 * tens of megabytes of source maps, which roughly doubles the worker's peak
 * memory.
 *
 * Returning `map: {mappings: ''}` from `load` skips Vite's source map handling.
 * Keep the source intact: sourceMappingURL text can also appear inside strings.
 * User code (the studio config, schema files, plugins outside `node_modules`)
 * keeps full source maps. A `sourceURL` comment keeps dependency file names in
 * stack traces.
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
        code: `${code}\n//# sourceURL=${id.replaceAll(/\s/g, encodeURIComponent)}\n`,
        map: {mappings: ''},
      }
    },
    name: 'sanity:studio-worker-skip-dependency-sourcemaps',
  }
}
