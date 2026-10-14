import {dirname, extname, isAbsolute, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

import {getTsconfig} from 'get-tsconfig'
import {moduleResolve} from 'import-meta-resolve'
import {type Plugin} from 'vite'

import {subdebug} from '../../_exports/debug.js'
import {getLocalPackageDir} from '../../util/getLocalPackageVersion.js'
import {isRecord} from '../../util/isRecord.js'
import {readJsonFileSync} from '../../util/readJsonFileSync.js'

const debug = subdebug('studio:worker')

const REQUIRE_CONDITIONS = new Set(['node', 'require'])
const JAVASCRIPT_EXTENSIONS = new Set(['', '.cjs', '.js', '.mjs'])

/**
 * Shares published Sanity dependencies with Node while Vite evaluates configuration
 * and plugins. Each importer keeps its own installed dependency versions.
 * @internal
 */
export function createNativeStudioDependencies(rootPath: string) {
  const rootUrl = pathToFileURL(join(rootPath, 'noop.js'))
  let sanityUrl: URL | undefined
  let packages = new Set<string>()
  try {
    const compilerOptions = getTsconfig(rootPath)?.config.compilerOptions
    const customResolution =
      compilerOptions?.baseUrl || Object.keys(compilerOptions?.paths ?? {}).length > 0
    if (customResolution) {
      debug('Keeping dependencies in Vite for custom TypeScript module resolution')
    } else {
      const sanityDir = getLocalPackageDir('sanity', rootPath)
      const manifest = readJsonFileSync(join(sanityDir, 'package.json'))
      const dependencyNames = (field: string) =>
        isRecord(manifest) && isRecord(manifest[field]) ? Object.keys(manifest[field]) : []

      sanityUrl = pathToFileURL(join(sanityDir, 'package.json'))
      packages = new Set([
        ...dependencyNames('dependencies'),
        ...dependencyNames('peerDependencies'),
      ])
    }
  } catch (err) {
    debug('Failed to configure native dependencies, leaving dependencies in Vite: %o', err)
  }

  const nativeUrls = new Set<string>()
  if (sanityUrl) {
    try {
      const entry = moduleResolve('sanity', rootUrl)
      if (JAVASCRIPT_EXTENSIONS.has(extname(entry.pathname))) nativeUrls.add(entry.href)
    } catch (err) {
      debug('Failed to resolve native Sanity entry point: %o', err)
    }
  }
  const commonJsCache = new Map<string, boolean>()

  const plugin = {
    enforce: 'pre',
    load(this: void, id) {
      if (!id.startsWith(COMMONJS_EXTERNAL_PREFIX)) return null

      const url = JSON.stringify(id.slice(COMMONJS_EXTERNAL_PREFIX.length))
      return [
        `import module from ${url}`,
        `export * from ${url}`,
        'export default module && module.__esModule ? module.default : module',
      ].join('\n')
    },
    name: 'sanity:studio-worker-externals',
    resolveId(this: void, id, importer, {kind}) {
      if (importer?.startsWith(COMMONJS_EXTERNAL_PREFIX) && nativeUrls.has(id)) {
        return {external: true, id}
      }

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

      const parent = importer ? toFileUrl(importer) : undefined
      const resolved = resolve(parent ? new URL(parent) : rootUrl)
      if (!resolved || !JAVASCRIPT_EXTENSIONS.has(extname(resolved.pathname))) {
        return null
      }

      nativeUrls.add(resolved.href)
      if (conditions) {
        return {external: true, id: fileURLToPath(resolved)}
      }
      if (isCommonJsFile(resolved, commonJsCache)) {
        return `${COMMONJS_EXTERNAL_PREFIX}${resolved.href}`
      }
      return {external: true, id: resolved.href}
    },
  } satisfies Plugin

  return {
    externalize(id: string): string | undefined {
      const url = toFileUrl(id)
      return url && nativeUrls.has(url) ? url : undefined
    },
    plugin,
  }
}

function toFileUrl(id: string): string | undefined {
  if (id.startsWith('file:')) return new URL(id).href
  if (id.startsWith('/@fs/')) return pathToFileURL(id.slice(4)).href
  if (isAbsolute(id)) return pathToFileURL(id).href
  return undefined
}

const COMMONJS_EXTERNAL_PREFIX = '\0sanity-commonjs-external:'

/**
 * Whether Node.js loads the given JavaScript file as CommonJS,
 * going by its extension or the `type` of the nearest `package.json`.
 */
function isCommonJsFile(url: URL, cache: Map<string, boolean>): boolean {
  if (url.pathname.endsWith('.cjs')) return true
  if (url.pathname.endsWith('.mjs')) return false

  let dir = dirname(fileURLToPath(url))
  const visited: string[] = []
  let commonJs = true
  for (;;) {
    const cached = cache.get(dir)
    if (cached !== undefined) {
      commonJs = cached
      break
    }

    visited.push(dir)
    const manifest = readPackageJson(join(dir, 'package.json'))
    if (manifest) {
      commonJs = manifest.type !== 'module'
      break
    }

    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  for (const path of visited) cache.set(path, commonJs)
  return commonJs
}

function readPackageJson(path: string): Record<string, unknown> | undefined {
  try {
    const manifest = readJsonFileSync(path)
    return isRecord(manifest) ? manifest : undefined
  } catch {
    return undefined
  }
}

/**
 * Returns the package name of a bare import specifier (`@sanity/ui/theme` →
 * `@sanity/ui`), or `undefined` for relative, absolute, URL and builtin imports.
 *
 * @internal
 */
function getPackageName(id: string): string | undefined {
  if (/^[./\0]/.test(id) || isAbsolute(id) || /^[\w+.-]+:/.test(id)) return undefined

  const [first, second] = id.split('/')
  if (!first.startsWith('@')) return first
  return second ? `${first}/${second}` : undefined
}
