import {type CliConfig, getSanityEnvVar} from '@sanity/cli-core'

import {determineIsApp} from './determineIsApp.js'
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
  /**
   * True when the port was pinned by the user (flag, env var, or
   * `server.port` in the CLI config) rather than falling back to the 3333
   * default. A pinned port is a contract with external tooling (port
   * allocators, proxies), so servers honoring it should fail fast on a busy
   * port instead of drifting to a free one.
   */
  httpPortConfigured: boolean
  schemaExtraction: CliConfig['schemaExtraction']
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
  const isApp = cliConfig ? determineIsApp(cliConfig) : false

  const httpHost =
    flags.host ||
    getSanityEnvVar('SERVER_HOSTNAME', isApp ?? false) ||
    cliConfig?.server?.hostname ||
    'localhost'

  const configuredPort =
    flags.port || getSanityEnvVar('SERVER_PORT', isApp ?? false) || cliConfig?.server?.port

  const httpPort = toInt(configuredPort, 3333)

  const basePath = ensureTrailingSlash(
    getSanityEnvVar('BASEPATH', isApp ?? false) ?? (cliConfig?.project?.basePath || '/'),
  )

  const entry = cliConfig?.app?.entry

  return {
    basePath,
    cwd: workDir,
    entry,
    httpHost,
    httpPort,
    httpPortConfigured: Boolean(configuredPort),
    isApp,
    schemaExtraction: cliConfig?.schemaExtraction,
    vite: cliConfig?.vite,
  }
}
