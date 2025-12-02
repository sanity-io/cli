import {getTsconfig} from 'get-tsconfig'
import {tsImport} from 'tsx/esm/api'

import {debug} from '../../debug.js'
import {tsxWorkerTask} from '../../loaders/tsx/tsxWorkerTask.js'
import {NotFoundError} from '../../util/NotFoundError.js'
import {tryGetDefaultExport} from '../../util/tryGetDefaultExport.js'
import {findPathForFiles} from '../util/findConfigsPaths.js'
import {cliConfigSchema} from './schemas.js'
import {type CliConfig} from './types.js'

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

  let cliConfig: CliConfig | undefined
  try {
    cliConfig = await tsxWorkerTask<CliConfig | undefined>(
      new URL('getCliConfig.worker.js', import.meta.url),
      {
        name: 'cliConfig',
        rootPath,
        workerData: {configPath},
      },
    )
  } catch (err) {
    debug('Failed to load CLI config in worker thread: %s', err)

    // Assuming that didn't work because of unseriazable properties, so we'll try the
    // main thread with tsx registered.
    const tsconfig = getTsconfig(rootPath)

    // Ensure we get the default export (sometimes we get a bit of a mixed bag)
    cliConfig = await tsImport(configPath, {
      parentURL: import.meta.url,
      tsconfig: tsconfig?.path ?? undefined,
    })
    cliConfig = tryGetDefaultExport(cliConfig) as CliConfig | undefined

    if (!cliConfig) {
      throw new Error('Invalid CLI config structure')
    }
  }

  const {data, error, success} = cliConfigSchema.safeParse(cliConfig)
  if (!success) {
    throw new Error(`Invalid CLI config: ${error.message}`)
  }

  // There is a minor difference here because of the `vite` property and how the types
  // aren't as specific as our manually typed `CliConfig` type, thus the cast.
  return data as CliConfig
}
