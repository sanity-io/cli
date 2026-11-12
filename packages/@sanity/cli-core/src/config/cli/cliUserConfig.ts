import {chmodSync, mkdirSync, statSync} from 'node:fs'
import {dirname, join as joinPath} from 'node:path'

import {z} from 'zod/mini'

import {debug} from '../../_exports/debug.js'
import {getCliExecutionContext} from '../../executionContext.js'
import {getSanityConfigDir} from '../../util/getSanityConfigDir.js'
import {readJsonFileSync} from '../../util/readJsonFileSync.js'
import {writeJsonFileSync} from '../../util/writeJsonFileSync.js'
import {
  clearCliTokenCache,
  type CliTokenInfo,
  getCachedTokenInfo,
  setCachedTokenInfo,
} from './cliTokenCache.js'
import {type ConfigStore} from './types/cliConfig.js'

// Re-export so existing consumers don't break
export {clearCliTokenCache} from './cliTokenCache.js'
export {type CliTokenInfo} from './cliTokenCache.js'

// Only used for testing
export const _internals = {
  getCliUserConfig,
}

/**
 * Get the CLI authentication token selected for the current invocation.
 *
 * @returns A promise that resolves to a CLI token, or undefined if no token is found
 * @internal
 */
export async function getCliToken(): Promise<string | undefined> {
  return (await getCliTokenInfo())?.token
}

/**
 * Get the CLI authentication token and where it was resolved from.
 *
 * @returns A promise that resolves to the token and its source, or undefined if no token is found
 * @internal
 */
export async function getCliTokenInfo(): Promise<CliTokenInfo | undefined> {
  // A per-invocation execution context token (e.g. per-request from an MCP
  // server) takes precedence and must bypass the process-wide cache entirely:
  // reading the cache would leak another invocation's token, and writing it
  // would leak this one's.
  const context = getCliExecutionContext()
  if (context) {
    return context.token === undefined
      ? undefined
      : {source: 'CLI execution context', token: context.token}
  }

  const cachedTokenInfo = getCachedTokenInfo()
  if (cachedTokenInfo !== undefined) {
    return cachedTokenInfo
  }

  const token = process.env.SANITY_AUTH_TOKEN
  if (token) {
    const tokenInfo = {
      source: 'SANITY_AUTH_TOKEN environment variable',
      token: token.trim(),
    }
    setCachedTokenInfo(tokenInfo)
    return tokenInfo
  }

  const configToken = _internals.getCliUserConfig('authToken')
  const tokenInfo =
    configToken === undefined ? undefined : {source: getCliUserConfigPath(), token: configToken}
  setCachedTokenInfo(tokenInfo)
  return tokenInfo
}

// The config file holds the CLI auth token, so keep it readable by its owner only
const CONFIG_DIR_OPTIONS = {mode: 0o700, recursive: true}
const CONFIG_WRITE_OPTIONS = {mode: 0o600, pretty: true}

const cliUserConfigSchema = {
  authToken: z.optional(z.string()),
}

/**
 * Set the config value for the given property.
 * Validates that the passed value adheres to the defined CLI config schema.
 *
 * @param prop - The property to set the value for
 * @param value - The value to set
 * @internal
 */
export function setCliUserConfig(prop: 'authToken', value: string | undefined): void {
  assertCanAccessHostUserConfig()
  const config = readConfig()
  const result = cliUserConfigSchema[prop].safeParse(value)
  if (!result.success) {
    const message = result.error.issues
      .map(({message, path}) => `[${path.join('.')}] ${message}`)
      .join('\n')

    throw new Error(`Invalid value for config property "${prop}": ${message}`)
  }

  const configPath = getCliUserConfigPath()
  mkdirSync(dirname(configPath), CONFIG_DIR_OPTIONS)

  // When value is undefined, explicitly delete the key rather than relying
  // on JSON.stringify silently dropping undefined values.
  if (value === undefined) {
    const {[prop]: _, ...rest} = config
    writeJsonFileSync(configPath, rest, CONFIG_WRITE_OPTIONS)
  } else {
    writeJsonFileSync(configPath, {...config, [prop]: value}, CONFIG_WRITE_OPTIONS)
  }

  // Invalidate the in-process token cache so subsequent getCliToken() calls
  // pick up the new value from disk.
  clearCliTokenCache()
}

/**
 * Get the config value for the given property
 *
 * @param prop - The property to get the value for
 * @returns The value of the given property
 */
export function getCliUserConfig(prop: 'authToken'): string | undefined {
  assertCanAccessHostUserConfig()
  const config = readConfig()
  const result = cliUserConfigSchema[prop].safeParse(config[prop])
  if (!result.success) {
    debug('Ignoring invalid stored value for "%s", returning undefined', prop)
    return undefined
  }

  return result.data
}

/**
 * Get a key-value store backed by the CLI user configuration file
 * (`~/.config/sanity/config.json`).
 *
 * Each call to `get`, `set`, or `delete` performs a full synchronous
 * read-modify-write cycle. This is intentional: sync I/O prevents
 * intra-process race conditions that occurred with the previous async
 * (configstore-backed) implementation.
 *
 * Note: there is no file-level locking, so concurrent writes from
 * separate CLI processes could still conflict. In practice this is
 * unlikely since CLI config writes are rare and user-initiated.
 *
 * @returns A {@link ConfigStore} for the CLI config file
 * @public
 */
export function getUserConfig(): ConfigStore {
  assertCanAccessHostUserConfig()
  return {
    get(key: string): unknown {
      const config = readConfig()
      return config[key]
    },

    set(key: string, value: unknown): void {
      const config = readConfig()
      const configPath = getCliUserConfigPath()
      mkdirSync(dirname(configPath), CONFIG_DIR_OPTIONS)
      writeJsonFileSync(configPath, {...config, [key]: value}, CONFIG_WRITE_OPTIONS)
      if (key === 'authToken') clearCliTokenCache()
    },

    // No mkdirSync needed: if readConfig() succeeded the directory already exists.
    delete(key: string): void {
      const config = readConfig()
      if (!(key in config)) return
      const {[key]: _, ...rest} = config
      writeJsonFileSync(getCliUserConfigPath(), rest, CONFIG_WRITE_OPTIONS)
      if (key === 'authToken') clearCliTokenCache()
    },
  }
}

function assertCanAccessHostUserConfig(): void {
  if (getCliExecutionContext()) {
    throw new Error('Host CLI user configuration is unavailable during programmatic invocations')
  }
}

/**
 * Read the whole configuration from file system. If the file does not exist,
 * is corrupt, or otherwise unreadable, an empty object is returned. This is
 * intentional: the config only holds recoverable data (auth tokens, telemetry
 * consent) so silently resetting is preferable to blocking the user.
 *
 * @returns The whole CLI configuration.
 * @internal
 */
function readConfig(): Record<string, unknown> {
  const configPath = getCliUserConfigPath()
  restrictConfigFilePermissions(configPath)
  try {
    const config = readJsonFileSync(configPath)
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('Invalid config file - expected an object')
    }
    return config
  } catch (err: unknown) {
    debug('Failed to read CLI config file: %s', err instanceof Error ? err.message : `${err}`)
    return {}
  }
}

/**
 * Remove group and other access from an existing config file. CLI versions from
 * 6.0.0 created it with the default umask mode (usually 0644), exposing the auth
 * token to other local users. Only touches files owned by the current user, and
 * never adds permissions.
 *
 * @param configPath - Path to the CLI configuration file
 */
function restrictConfigFilePermissions(configPath: string): void {
  // No POSIX permissions to fix on Windows
  if (typeof process.getuid !== 'function') return

  try {
    const {mode, uid} = statSync(configPath)
    if (uid !== process.getuid() || (mode & 0o077) === 0) return

    chmodSync(configPath, mode & 0o700)
    debug('Restricted permissions of %s to owner only', configPath)
  } catch (err: unknown) {
    debug(
      'Could not restrict permissions of CLI config file: %s',
      err instanceof Error ? err.message : `${err}`,
    )
  }
}

/**
 * Get the file system location for the CLI user configuration file.
 * Takes into account the active environment (staging vs production).
 * The file is located in the user's home directory under the `.config` directory.
 *
 * @returns The path to the CLI configuration file.
 * @internal
 */
function getCliUserConfigPath() {
  return process.env.SANITY_CLI_CONFIG_PATH || joinPath(getSanityConfigDir(), 'config.json')
}
