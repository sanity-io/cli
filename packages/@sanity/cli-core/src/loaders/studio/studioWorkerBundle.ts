import {isAbsolute, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

import {moduleResolve} from 'import-meta-resolve'
import {type Plugin} from 'vite'

import {subdebug} from '../../_exports/debug.js'
import {getLocalPackageDir} from '../../util/getLocalPackageVersion.js'
import {isRecord} from '../../util/isRecord.js'
import {readJsonFileSync} from '../../util/readJsonFileSync.js'

const debug = subdebug('studio:worker')

const REQUIRE_CONDITIONS = new Set(['node', 'require'])

/**
 * Leaves `sanity` and the copies of its dependencies and peer dependencies
 * (react, styled-components…) that `sanity` itself uses out of the bundle, so
 * that the studio config, its plugins and the CLI share one instance of each.
 * Everything else, including other copies of the same packages, is bundled.
 *
 * External imports are resolved the way Node.js resolves them (the same way
 * `resolveLocalPackage()` resolves `sanity` for the CLI) and emitted as file
 * URLs, or absolute paths for `require()` calls in bundled CommonJS modules, so
 * they load the exact same files no matter where the importing plugin is
 * installed. Imports that don't resolve to JavaScript (CSS, for instance) are
 * bundled.
 *
 * @internal
 */
export function sanityExternalsPlugin(rootPath: string): Plugin {
  const rootUrl = pathToFileURL(join(rootPath, 'noop.js'))
  let sanityUrl: URL | undefined
  let packages = new Set<string>()
  try {
    const sanityDir = getLocalPackageDir('sanity', rootPath)
    const manifest = readJsonFileSync(join(sanityDir, 'package.json'))
    const dependencyNames = (field: string) =>
      isRecord(manifest) && isRecord(manifest[field]) ? Object.keys(manifest[field]) : []

    sanityUrl = pathToFileURL(join(sanityDir, 'package.json'))
    packages = new Set([...dependencyNames('dependencies'), ...dependencyNames('peerDependencies')])
  } catch (err) {
    debug('Failed to read the `sanity` package manifest, bundling every dependency: %o', err)
  }

  return {
    enforce: 'pre',
    name: 'sanity:studio-worker-externals',
    resolveId(id, importer, {kind}) {
      const packageName = getPackageName(id)
      if (!sanityUrl || !packageName || (packageName !== 'sanity' && !packages.has(packageName))) {
        return null
      }

      const conditions = kind === 'require-call' ? REQUIRE_CONDITIONS : undefined
      const resolve = (parent: URL) => {
        try {
          return moduleResolve(id, parent, conditions)
        } catch {
          return null
        }
      }

      const resolved = resolve(importer && isAbsolute(importer) ? pathToFileURL(importer) : rootUrl)
      if (
        !resolved ||
        !/\.[cm]?js$/.test(resolved.pathname) ||
        (packageName !== 'sanity' && resolve(sanityUrl)?.href !== resolved.href)
      ) {
        return null
      }

      return {external: true, id: conditions ? fileURLToPath(resolved) : resolved.href}
    },
  }
}

/**
 * Fetches `https://` imports (e.g. `https://themer.sanity.build/…`) and bundles
 * them, resolving their relative and root-relative imports against their URL.
 *
 * @internal
 */
export function httpsImportsPlugin(fetchModule = fetchHttpModule): Plugin {
  return {
    enforce: 'pre',
    async load(id) {
      return isHttpsUrl(id) ? fetchModule(id) : null
    },
    name: 'sanity:studio-worker-https-imports',
    resolveId(id, importer) {
      if (isHttpsUrl(id)) return id
      if (importer && isHttpsUrl(importer)) return new URL(id, importer).href
      return null
    },
  }
}

async function fetchHttpModule(url: string): Promise<string> {
  debug('Fetching HTTP import: %s', url)
  const response = await fetch(url, {signal: AbortSignal.timeout(30_000)})
  if (!response.ok) {
    throw new Error(`Failed to fetch module from ${url}: ${response.status} ${response.statusText}`)
  }

  return response.text()
}

function isHttpsUrl(id: string): boolean {
  return id.startsWith('https://')
}

/**
 * Returns the package name of a bare import specifier (`@sanity/ui/theme` →
 * `@sanity/ui`), or `undefined` for relative, absolute, URL and builtin imports.
 *
 * @internal
 */
export function getPackageName(id: string): string | undefined {
  if (/^[./\0]/.test(id) || isAbsolute(id) || /^[\w+.-]+:/.test(id)) return undefined

  const [first, second] = id.split('/')
  if (!first.startsWith('@')) return first
  return second ? `${first}/${second}` : undefined
}
