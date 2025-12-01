import {existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import {join} from 'node:path'

import {register} from 'tsx/esm/api'

import {NotFoundError} from '../../util/NotFoundError.js'
import {tryGetDefaultExport} from '../../util/tryGetDefaultExport.js'
import {cliConfigSchema} from './schemas.js'
import {type CliConfig} from './types/cliConfig.js'

/**
 * Get the CLI config for a project synchronously, given the root path.
 *
 * This loads the CLI config in the main thread using tsx/register for TypeScript support.
 * Note: This is a synchronous operation and does not use worker threads like the async version.
 *
 * @param rootPath - Root path for the project, eg where `sanity.cli.(ts|js)` is located.
 * @returns The CLI config
 * @internal
 */
export function getCliConfigSync(rootPath: string): CliConfig {
  const possiblePaths = ['sanity.cli.ts', 'sanity.cli.js'].map((file) => join(rootPath, file))
  const configPaths = possiblePaths.filter((path) => existsSync(path))

  if (configPaths.length === 0) {
    throw new NotFoundError(`No CLI config found at ${rootPath}/sanity.cli.(ts|js)`)
  }

  if (configPaths.length > 1) {
    throw new Error(`Multiple CLI config files found (${configPaths.join(', ')})`)
  }

  const configPath = configPaths[0]

  // Register tsx for TypeScript support
  const unregister = register()

  let cliConfig: CliConfig | undefined
  try {
    // Use createRequire for synchronous loading in ESM contexts
    // This works when tsx loader is active
    const require = createRequire(import.meta.url)
    const loaded = require(configPath)
    cliConfig = tryGetDefaultExport(loaded) as CliConfig | undefined
  } finally {
    unregister()
  }

  const {data, error, success} = cliConfigSchema.safeParse(cliConfig)
  if (!success) {
    throw new Error(`Invalid CLI config: ${error.message}`)
  }

  // There is a minor difference here because of the `vite` property and how the types
  // aren't as specific as our manually typed `CliConfig` type, thus the cast.
  return data as CliConfig
}
