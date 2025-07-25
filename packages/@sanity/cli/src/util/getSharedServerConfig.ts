import {type CliConfig} from '@sanity/cli-core'

import {ensureTrailingSlash} from './ensureTrailingSlash.js'
import {toInt} from './toInt.js'

interface GetSharedServerConfigOptions {
  flags: {host?: string; port?: number | string}
  workDir: string

  cliConfig?: CliConfig
}

export interface GetSharedServerConfigResult {
  basePath: string
  cwd: string
  httpHost: string
  httpPort: number
  vite: CliConfig['vite']

  entry?: string
  isApp?: boolean
}

/**
 * @internal
 *
 * Resolves the shared configuration for the dev/preview server using:
 *
 * - CLI flags
 * - Environment variables
 * - User build config
 * - Default configuration
 */
export function getSharedServerConfig({
  cliConfig,
  flags,
  workDir,
}: GetSharedServerConfigOptions): GetSharedServerConfigResult {
  // Order of preference: CLI flags, environment variables, user build config, default config
  const env = process.env

  const httpHost =
    flags.host || env.SANITY_STUDIO_SERVER_HOSTNAME || cliConfig?.server?.hostname || 'localhost'

  const httpPort = toInt(
    flags.port || env.SANITY_STUDIO_SERVER_PORT || cliConfig?.server?.port,
    3333,
  )

  const basePath = ensureTrailingSlash(
    env.SANITY_STUDIO_BASEPATH ?? (cliConfig?.project?.basePath || '/'),
  )

  const isApp = cliConfig && 'app' in cliConfig
  const entry = cliConfig?.app?.entry

  return {
    basePath,
    cwd: workDir,
    entry,
    httpHost,
    httpPort,
    isApp,
    vite: cliConfig?.vite,
  }
}
