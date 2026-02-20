import {getIt, type Requester} from 'get-it'
import {debug, headers, httpErrors, promise} from 'get-it/middleware'
import {readPackageUpSync} from 'read-package-up'

let cachedPkg: {name: string; version: string} | undefined

/**
 * Options for configuring individual middleware in {@link createRequester}.
 *
 * Each key corresponds to a middleware. Omitting a key uses the default,
 * `false` disables it, and an object merges with the defaults.
 *
 * @public
 */
export type MiddlewareOptions = {
  debug?: false | {namespace?: string; verbose?: boolean}
  headers?: false | Record<string, string>
  httpErrors?: false
  promise?: false | {onlyBody?: boolean}
}

/**
 * Creates a `get-it` requester with a standard set of middleware.
 *
 * Default middleware (in order):
 * 1. `httpErrors()` — throw on HTTP error status codes
 * 2. `headers({'User-Agent': '@sanity/cli-core@<version>'})` — identify CLI requests
 * 3. `debug({verbose: true, namespace: 'sanity:cli'})` — debug logging
 * 4. `promise({onlyBody: true})` — return body directly (must be last)
 *
 * @param options - Optional configuration to disable or customize middleware
 * @returns A configured `get-it` requester
 * @public
 */
export function createRequester(options?: {middleware?: MiddlewareOptions}): Requester {
  const opts = options?.middleware

  const middleware = []

  // 1. httpErrors
  if (opts?.httpErrors !== false) {
    middleware.push(httpErrors())
  }

  // 2. headers
  if (opts?.headers !== false) {
    const customHeaders = typeof opts?.headers === 'object' ? opts.headers : {}
    const allHeaders = customHeaders['User-Agent']
      ? {...customHeaders}
      : {
          get ['User-Agent']() {
            const pkg = getPackageInfo()
            return `${pkg.name}@${pkg.version}`
          },
          ...customHeaders,
        }
    middleware.push(headers(allHeaders))
  }

  // 3. debug
  if (opts?.debug !== false) {
    const debugDefaults = {namespace: 'sanity:cli', verbose: true}
    const customDebug = typeof opts?.debug === 'object' ? opts.debug : {}
    middleware.push(debug({...debugDefaults, ...customDebug}))
  }

  // 4. promise (must be last)
  if (opts?.promise !== false) {
    const promiseDefaults = {onlyBody: true}
    const customPromise = typeof opts?.promise === 'object' ? opts.promise : {}
    middleware.push(promise({...promiseDefaults, ...customPromise}))
  }

  return getIt(middleware)
}

/**
 * Reads the nearest `package.json` to determine the name and version of the `@sanity/cli-core` package.
 *
 * @returns The name and version of the package
 * @internal
 */
function getPackageInfo(): {name: string; version: string} {
  if (cachedPkg) return cachedPkg

  const result = readPackageUpSync({cwd: import.meta.dirname})
  if (!result) {
    throw new Error('Unable to resolve @sanity/cli-core package root')
  }

  cachedPkg = {
    name: result.packageJson.name ?? '@sanity/cli-core',
    version: result.packageJson.version ?? '0.0.0',
  }
  return cachedPkg
}
