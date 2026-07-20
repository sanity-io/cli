import {readFileSync} from 'node:fs'

import debugIt from 'debug'
import {up as packageUp} from 'empathic/package'
import {
  createRequester as createGetItRequester,
  type FetchHeaders,
  type RequesterOptions,
  type RequestFunction,
  type TransformMiddleware,
  type WrappingMiddleware,
} from 'get-it'
import {debug as debugMiddleware} from 'get-it/middleware'

let cachedPkg: {name: string; version: string} | undefined

/**
 * Options for creating a Sanity CLI requester.
 *
 * Extends get-it v9's {@link RequesterOptions} with Sanity CLI defaults for
 * User-Agent headers and debug logging.
 *
 * @public
 */
export type CreateRequesterOptions = Omit<RequesterOptions, 'headers'> & {
  /**
   * Debug logging middleware. Defaults to enabled with namespace `sanity:cli`.
   * Pass `false` to disable.
   */
  debug?: false | {namespace?: string; verbose?: boolean}
  /**
   * Default headers for all requests.
   * Omitting uses a lazy User-Agent of `@sanity/cli-core@<version>`.
   * Pass `false` to send no default headers.
   */
  headers?: false | Record<string, string>
}

/**
 * Creates a get-it requester with Sanity CLI defaults.
 *
 * Defaults:
 * - User-Agent header: `@sanity/cli-core@<version>` (lazy)
 * - Debug logging via `DEBUG=sanity:cli` (verbose)
 * - HTTP error throwing on (get-it default)
 *
 * @param options - Optional configuration to customize or disable defaults
 * @returns A configured get-it request function
 * @public
 */
export function createRequester(
  options: CreateRequesterOptions & {as: 'json'},
): RequestFunction<'json'>
export function createRequester(
  options: CreateRequesterOptions & {as: 'text'},
): RequestFunction<'text'>
export function createRequester(
  options: CreateRequesterOptions & {as: 'stream'},
): RequestFunction<'stream'>
export function createRequester(options?: CreateRequesterOptions): RequestFunction
export function createRequester(
  options?: CreateRequesterOptions,
): RequestFunction<'json' | 'stream' | 'text' | undefined> {
  const {debug, headers, middleware = [], ...getItOptions} = options ?? {}

  const resolvedMiddleware: Array<TransformMiddleware | WrappingMiddleware> = [...middleware]
  if (debug !== false) {
    const debugDefaults = {namespace: 'sanity:cli', verbose: true}
    const customDebug = typeof debug === 'object' ? debug : {}
    const {namespace, verbose} = {...debugDefaults, ...customDebug}
    resolvedMiddleware.push(debugMiddleware({log: debugIt(namespace), verbose}))
  }

  return createGetItRequester({
    ...getItOptions,
    headers: resolveDefaultHeaders(headers),
    middleware: resolvedMiddleware,
  })
}

/**
 * Builds default headers, including a lazy User-Agent unless overridden or disabled.
 *
 * @internal
 */
function resolveDefaultHeaders(
  headers: false | Record<string, string> | undefined,
): FetchHeaders | undefined {
  if (headers === false) {
    return undefined
  }

  const customHeaders = typeof headers === 'object' ? headers : {}
  if (Object.keys(customHeaders).some((header) => header.toLowerCase() === 'user-agent')) {
    return customHeaders
  }

  return {
    get ['User-Agent']() {
      const pkg = getPackageInfo()
      return `${pkg.name}@${pkg.version}`
    },
    ...customHeaders,
  }
}

/**
 * Reads the nearest `package.json` to determine the name and version of the `@sanity/cli-core` package.
 *
 * @returns The name and version of the package
 * @internal
 */
function getPackageInfo(): {name: string; version: string} {
  if (cachedPkg) return cachedPkg

  const pkgPath = packageUp({cwd: import.meta.dirname})
  if (!pkgPath) {
    throw new Error('Unable to resolve @sanity/cli-core package root')
  }

  const packageJson = JSON.parse(readFileSync(pkgPath, 'utf8'))
  cachedPkg = {
    name: packageJson.name ?? '@sanity/cli-core',
    version: packageJson.version ?? '0.0.0',
  }
  return cachedPkg
}
