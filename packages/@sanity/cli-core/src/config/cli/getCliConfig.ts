import {debug} from '../../debug.js'
import {NotFoundError} from '../../errors/NotFoundError.js'
import {importModule} from '../../util/importModule.js'
import {findPathForFiles} from '../util/findConfigsPaths.js'
import {cliConfigSchema} from './schemas.js'
import {type CliConfig} from './types/cliConfig.js'

/**
 * Get the CLI config for a project, given the root path.
 *
 * We really want to avoid loading the CLI config in the main thread, as we'll need
 * TypeScript loading logic, potentially with ts path aliases, syntax extensions and all
 * sorts of nonsense. Thus, we _attempt_ to use a worker thread - but have to fall back
 * to using the main thread if not possible. This can be the case if the configuration
 * contains non-serializable properties, such as functions. This is unfortunately used
 * by the vite config, for example.
 *
 * @param rootPath - Root path for the project, eg where `sanity.cli.(ts|js)` is located.
 * @returns The CLI config
 * @internal
 */
export async function getCliConfig(rootPath: string): Promise<CliConfig> {
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
