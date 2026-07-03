import {createRequire} from 'node:module'
import {dirname} from 'node:path'

import {debug} from '../../debug.js'
import {NotFoundError} from '../../errors/NotFoundError.js'
import {importModule} from '../../util/importModule.js'
import {findPathForFiles} from '../util/findConfigsPaths.js'
import {cliConfigSchema} from './schemas.js'
import {type CliConfig} from './types/cliConfig.js'
import {hasWorkbenchAppBrand, parseWorkbenchCliConfig} from './workbenchApp.js'

const cache = new Map<string, Promise<CliConfig>>()

/**
 * Get the CLI config for a project, given the root path.
 *
 * Results are cached in-memory keyed by rootPath for the lifetime of the
 * process. Since the CLI always runs from a single project root, the config
 * won't change during a command's execution, so caching avoids redundant
 * filesystem reads and jiti imports from the prerun hook, SanityCommand
 * helpers, and action files.
 *
 * If loading fails the cached promise is evicted so the next call retries.
 *
 * Long-lived processes that need to observe edits to `sanity.cli.(ts|js)`
 * (e.g. a dev-server watcher) should use {@link getCliConfigUncached}
 * instead — it bypasses both this in-memory cache and Node's module cache.
 *
 * @param rootPath - Root path for the project, eg where `sanity.cli.(ts|js)` is located.
 * @returns The CLI config
 * @internal
 */
export function getCliConfig(rootPath: string): Promise<CliConfig> {
  const cached = cache.get(rootPath)
  if (cached) {
    return cached
  }

  const promise = getCliConfigUncached(rootPath).catch((err) => {
    cache.delete(rootPath)
    throw err
  })

  cache.set(rootPath, promise)
  return promise
}

/**
 * Read the CLI config for a project from disk, bypassing both the
 * `getCliConfig` in-memory cache and Node's module cache. Each call locates
 * `sanity.cli.(ts|js)`, drops any prior jiti compilation from `require.cache`,
 * re-imports, and re-validates.
 *
 * Use this when the config file is expected to change during the process's
 * lifetime — typically a dev-server watcher that needs the new values picked
 * up after each save. One-shot CLI invocations should prefer
 * {@link getCliConfig} so the prerun hook, SanityCommand helpers, and action
 * files share a single load.
 *
 * @param rootPath - Root path for the project, eg where `sanity.cli.(ts|js)` is located.
 * @returns The freshly loaded CLI config
 * @internal
 */
export async function getCliConfigUncached(rootPath: string): Promise<CliConfig> {
  const paths = await findPathForFiles(rootPath, ['sanity.cli.ts', 'sanity.cli.js'])
  const configPaths = paths.filter((path) => path.exists)

  if (configPaths.length === 0) {
    throw new NotFoundError(`No CLI config found at ${rootPath}/sanity.cli.(ts|js)`)
  }

  if (configPaths.length > 1) {
    throw new Error(
      `Multiple CLI config files found (${configPaths.map((path) => path.path).join(', ')})`,
    )
  }

  const configPath = configPaths[0].path

  debug(`Loading CLI config from: ${configPath}`)

  // Drop any cached compilation of this file from Node's CJS module cache
  // (jiti compiles `sanity.cli.ts` to CJS and registers it via `require.cache`).
  // Without this, repeated calls would receive the previously imported module
  // even though the file on disk has changed. No-op on first load.
  const cjsRequire = createRequire(import.meta.url)
  delete cjsRequire.cache[configPath]

  let cliConfig: CliConfig | undefined
  try {
    const result = await importModule<CliConfig>(configPath)

    debug('CLI config loaded: %o', result)

    cliConfig = result
  } catch (err) {
    debug('Failed to load CLI config in worker thread: %s', err)

    throw new Error('CLI config cannot be loaded', {cause: err})
  }

  // Branch as early as possible: a branded `unstable_defineApp(...)` opts into
  // workbench behavior, so its `app` skips the legacy `app` schema entirely.
  if (hasWorkbenchAppBrand(cliConfig?.app)) {
    return parseWorkbenchCliConfig(cliConfig, dirname(configPath))
  }

  const {data, error, success} = cliConfigSchema.safeParse(cliConfig)
  if (!success) {
    debug(`Invalid CLI config: ${error.message}`)
    throw new Error(`Invalid CLI config: ${error.message}`, {cause: error})
  }

  return data
}
