import {existsSync} from 'node:fs'
import {dirname, extname, join} from 'node:path'

import {type FetchResult} from 'vite/module-runner'

import {getLocalPackageDir} from '../../util/getLocalPackageVersion.js'
import {isRecord} from '../../util/isRecord.js'
import {readJsonFileSync} from '../../util/readJsonFileSync.js'

/**
 * Packages that must always run through the Vite module runner. The CLI's own
 * code calls `doImport()` on user files (the studio config, for instance), and
 * those imports only get TypeScript, path aliases, `define` and friends when the
 * calling module is itself evaluated by the runner. Matches `@sanity/cli`,
 * `@sanity/cli-core`, `@sanity/cli-build` and other `@sanity/*-cli` packages.
 */
const CLI_PACKAGE_PATTERN = /^@sanity\/(?:[\w.-]+-)?cli(?:-[\w.-]+)?$/

/**
 * Node.js error codes thrown when a module can't be resolved, loaded or linked
 * natively, but that a bundler (Vite) might still handle: CSS/asset imports,
 * extensionless or directory imports, JSON imports without attributes and so on.
 */
const NATIVE_MODULE_LOAD_ERROR_CODES = new Set([
  'ERR_IMPORT_ASSERTION_TYPE_MISSING',
  'ERR_IMPORT_ATTRIBUTE_MISSING',
  'ERR_IMPORT_ATTRIBUTE_TYPE_INCOMPATIBLE',
  'ERR_INVALID_PACKAGE_CONFIG',
  'ERR_INVALID_PACKAGE_TARGET',
  'ERR_MODULE_NOT_FOUND',
  'ERR_PACKAGE_IMPORT_NOT_DEFINED',
  'ERR_PACKAGE_PATH_NOT_EXPORTED',
  'ERR_REQUIRE_ASYNC_MODULE',
  'ERR_REQUIRE_CYCLE_MODULE',
  'ERR_REQUIRE_ESM',
  'ERR_UNKNOWN_FILE_EXTENSION',
  'ERR_UNKNOWN_MODULE_FORMAT',
  'ERR_UNSUPPORTED_DIR_IMPORT',
  'ERR_UNSUPPORTED_ESM_URL_SCHEME',
])

/**
 * Errors thrown when CommonJS-only globals are referenced from a file that
 * Node.js loads as an ES module (bundlers tolerate this, Node.js does not).
 */
const COMMONJS_GLOBAL_REFERENCE_ERROR =
  /^(?:require|module|exports|__dirname|__filename) is not defined/

interface GetStudioWorkerExternalsOptions {
  /**
   * Files from CLI packages running in the worker (the loader and the task
   * file). The runtime dependencies of the packages they belong to are loaded
   * natively.
   */
  cliFilePaths: string[]

  /**
   * Root path of the studio
   */
  studioRootPath: string
}

/**
 * Returns the packages that the studio worker loads with Node.js instead of
 * transforming them through Vite: `sanity`, its dependencies and peer
 * dependencies, and the runtime dependencies of the CLI packages involved.
 *
 * These packages are published to run in Node.js, so loading them natively
 * gives one instance of each (shared by the user's config, plugins and the CLI)
 * without the memory cost of transforming the entire Studio through Vite.
 * Everything else, including the user's own files and third-party plugins,
 * still goes through Vite like before.
 *
 * Returns `undefined` when `sanity` can't be found from the studio root, in
 * which case all dependencies should go through Vite.
 *
 * @internal
 */
export function getStudioWorkerExternals(
  options: GetStudioWorkerExternalsOptions,
): string[] | undefined {
  const {cliFilePaths, studioRootPath} = options

  let sanityPackageJsonPath: string
  try {
    sanityPackageJsonPath = join(getLocalPackageDir('sanity', studioRootPath), 'package.json')
  } catch {
    return undefined
  }

  const externals = new Set<string>(['sanity'])
  const packageJsonPaths = [
    sanityPackageJsonPath,
    ...cliFilePaths.map((filePath) => findNearestPackageJson(dirname(filePath))),
  ]

  for (const packageJsonPath of packageJsonPaths) {
    if (!packageJsonPath) continue

    const manifest = readManifest(packageJsonPath)
    const isSanity = packageJsonPath === sanityPackageJsonPath
    for (const name of [
      ...getDependencyNames(manifest?.dependencies),
      // The studio's peer dependencies (react, styled-components…) are shared with plugins
      ...(isSanity ? getDependencyNames(manifest?.peerDependencies) : []),
    ]) {
      externals.add(name)
    }
  }

  return [...externals].filter((name) => !CLI_PACKAGE_PATTERN.test(name)).toSorted()
}

/**
 * Returns the name of the package that the given file belongs to, if the file
 * lives inside a `node_modules` folder.
 *
 * @internal
 */
export function getNodeModulesPackageName(filePath: string): string | undefined {
  const segments = filePath.split(/[/\\]/)
  const index = segments.lastIndexOf('node_modules')
  if (index === -1) return undefined

  const name = segments[index + 1]
  if (!name) return undefined
  if (!name.startsWith('@')) return name

  const scopedName = segments[index + 2]
  return scopedName ? `${name}/${scopedName}` : undefined
}

/**
 * Returns the module format Node.js will use for a JavaScript file, based on its
 * extension and the `type` field of the nearest `package.json`.
 *
 * @internal
 */
export function getNodeModuleFormat(filePath: string): 'commonjs' | 'module' {
  const extension = extname(filePath)
  if (extension === '.mjs') return 'module'
  if (extension === '.cjs') return 'commonjs'

  const packageJsonPath = findNearestPackageJson(dirname(filePath))
  const manifest = packageJsonPath ? readManifest(packageJsonPath) : undefined
  return manifest?.type === 'module' ? 'module' : 'commonjs'
}

/**
 * Whether the error means Node.js could not load a module natively, in a way
 * that loading it through Vite (like a bundler would) may fix.
 *
 * @internal
 */
export function isNativeModuleLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const code = 'code' in error ? error.code : undefined
  if (typeof code === 'string' && NATIVE_MODULE_LOAD_ERROR_CODES.has(code)) return true

  // Compare names, not prototypes: the browser stubs may replace the global
  // error constructors, and errors may come from another realm.
  if (error.name === 'SyntaxError') return true
  return error.name === 'ReferenceError' && COMMONJS_GLOBAL_REFERENCE_ERROR.test(error.message)
}

interface PreferNativeExternalOptions {
  /**
   * Imports the module with Node.js
   */
  importNatively: (url: string) => Promise<unknown>

  /**
   * Fetches the module through Vite (transformed and evaluated by the runner)
   */
  inline: (url: string) => Promise<FetchResult>

  /**
   * Called when the module can't be loaded natively and is inlined instead
   */
  onInline?: (url: string, error: unknown) => void
}

/**
 * Loads an externalized module with Node.js right away, so that a module that
 * Node.js can't load (one that imports CSS, uses extensionless imports and so
 * on) can be transformed by Vite instead, like a bundler would. Node.js caches
 * the module, so the runner's own import of it afterwards is free.
 *
 * Errors that aren't about loading the module (an exception thrown while
 * evaluating it, for instance) are rethrown as-is.
 *
 * @internal
 */
export async function preferNativeExternal(
  result: FetchResult,
  options: PreferNativeExternalOptions,
): Promise<FetchResult> {
  if (!('externalize' in result) || !result.externalize.startsWith('file://')) {
    return result
  }

  try {
    await options.importNatively(result.externalize)
    return result
  } catch (error) {
    if (!isNativeModuleLoadError(error)) {
      throw error
    }

    options.onInline?.(result.externalize, error)
    return options.inline(result.externalize)
  }
}

function findNearestPackageJson(fromDir: string): string | undefined {
  let dir = fromDir
  while (true) {
    const candidate = join(dir, 'package.json')
    if (existsSync(candidate)) return candidate

    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

function readManifest(packageJsonPath: string): Record<string, unknown> | undefined {
  try {
    const manifest = readJsonFileSync(packageJsonPath)
    return isRecord(manifest) ? manifest : undefined
  } catch {
    return undefined
  }
}

function getDependencyNames(dependencies: unknown): string[] {
  return isRecord(dependencies) ? Object.keys(dependencies) : []
}
