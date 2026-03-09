import {debug} from '../../debug.js'
import {NotFoundError} from '../../errors/NotFoundError.js'
import {importModule} from '../../util/importModule.js'
import {findPathForFiles} from '../util/findConfigsPaths.js'
import {cliConfigSchema} from './schemas.js'
import {type CliConfig} from './types/cliConfig.js'

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
 * @param rootPath - Root path for the project, eg where `sanity.cli.(ts|js)` is located.
 * @returns The CLI config
 * @internal
 */
export function getCliConfig(rootPath: string): Promise<CliConfig> {
  const cached = cache.get(rootPath)
  if (cached) {
    return cached
  }

  const promise = loadCliConfig(rootPath).catch((err) => {
    cache.delete(rootPath)
    throw err
  })

  cache.set(rootPath, promise)
  return promise
}

async function loadCliConfig(rootPath: string): Promise<CliConfig> {
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

  let cliConfig: CliConfig | undefined
  try {
    const result = await importModule<CliConfig>(configPath)

    debug('CLI config loaded: %o', result)

    cliConfig = result
  } catch (err) {
    debug('Failed to load CLI config in worker thread: %s', err)

    throw new Error('CLI config cannot be loaded', {cause: err})
  }

  const {data, error, success} = cliConfigSchema.safeParse(cliConfig)
  if (!success) {
    debug(`Invalid CLI config: ${error.message}`)
    throw new Error(`Invalid CLI config: ${error.message}`, {cause: error})
  }

  return data
}
