import {dirname, isAbsolute, join} from 'node:path'
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
 * A plugin's own nested copy of `sanity` is left out as well: Node.js loads it
 * as its own instance, as it is in any other setup, and it shares the packages
 * it resolves to the same files as the studio's `sanity` does.
 *
 * External imports are resolved the way Node.js resolves them (the same way
 * `resolveLocalPackage()` resolves `sanity` for the CLI) and emitted as file
 * URLs, or absolute paths for `require()` calls in bundled CommonJS modules, so
 * they load the exact same files no matter where the importing plugin is
 * installed. Imports that don't resolve to JavaScript (CSS, for instance) are
 * bundled.
 *
 * Imports of CommonJS externals go through a small wrapper module that gives
 * them the default export bundlers (and Vite, before) give them. Node.js makes
 * `module.exports` the default export, so a default import of
 * `styled-components` would otherwise get its whole `exports` object instead
 * of `exports.default`, which transpiled ES modules export.
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

  const commonJsCache = new Map<string, boolean>()

  return {
    enforce: 'pre',
    load(id) {
      if (!id.startsWith(COMMONJS_EXTERNAL_PREFIX)) return null

      const url = JSON.stringify(id.slice(COMMONJS_EXTERNAL_PREFIX.length))
      return [
        `import module from ${url}`,
        `export * from ${url}`,
        'export default module && module.__esModule ? module.default : module',
      ].join('\n')
    },
    name: 'sanity:studio-worker-externals',
    resolveId(id, importer, {kind}) {
      if (importer?.startsWith(COMMONJS_EXTERNAL_PREFIX)) {
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

      const resolved = resolve(importer && isAbsolute(importer) ? pathToFileURL(importer) : rootUrl)
      if (
        !resolved ||
        !/\.[cm]?js$/.test(resolved.pathname) ||
        (packageName !== 'sanity' && resolve(sanityUrl)?.href !== resolved.href)
      ) {
        return null
      }

      if (conditions) {
        return {external: true, id: fileURLToPath(resolved)}
      }
      if (isCommonJsFile(resolved, commonJsCache)) {
        return `${COMMONJS_EXTERNAL_PREFIX}${resolved.href}`
      }
      return {external: true, id: resolved.href}
    },
  }
}

const COMMONJS_EXTERNAL_PREFIX = '\0sanity-commonjs-external:'

/**
 * Whether Node.js loads the given `.js`, `.cjs` or `.mjs` file as CommonJS,
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

const IMPORT_META_PROPERTIES = new Set(['dirname', 'filename', 'url'])

/**
 * Replaces `import.meta.url`, `import.meta.filename` and `import.meta.dirname`
 * in every bundled file with that file's own URL, path and directory. The
 * bundle runs as the studio config, so these would otherwise all point at the
 * config, breaking `new URL('./file', import.meta.url)` and
 * `createRequire(import.meta.url)` in files that live elsewhere.
 *
 * @internal
 */
export function importMetaPathsPlugin(): Plugin {
  return {
    enforce: 'post',
    name: 'sanity:studio-worker-import-meta-paths',
    transform: {
      filter: {code: /import\.meta\s*\.\s*(?:dirname|filename|url)\b/},
      handler(code, id) {
        const filename = id.split('?')[0]
        if (!isAbsolute(filename)) return null

        const values: Record<string, string> = {
          dirname: dirname(filename),
          filename,
          url: pathToFileURL(filename).href,
        }
        const replacements: {end: number; start: number; value: string}[] = []
        walk(this.parse(code), (node) => {
          if (
            node.type === 'MemberExpression' &&
            !node.computed &&
            isRecord(node.object) &&
            node.object.type === 'MetaProperty' &&
            isRecord(node.object.meta) &&
            node.object.meta.name === 'import' &&
            isRecord(node.property) &&
            typeof node.property.name === 'string' &&
            IMPORT_META_PROPERTIES.has(node.property.name) &&
            typeof node.start === 'number' &&
            typeof node.end === 'number'
          ) {
            replacements.push({
              end: node.end,
              start: node.start,
              value: JSON.stringify(values[node.property.name]),
            })
          }
        })
        if (replacements.length === 0) return null

        let result = ''
        let offset = 0
        for (const {end, start, value} of replacements.toSorted((a, b) => a.start - b.start)) {
          result += `${code.slice(offset, start)}${value}`
          offset = end
        }
        return {code: result + code.slice(offset), map: null}
      },
    },
  }
}

function walk(node: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (!isRecord(node)) return

  if (typeof node.type === 'string') visit(node)
  for (const key in node) {
    if (key !== 'parent') walk(node[key], visit)
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
