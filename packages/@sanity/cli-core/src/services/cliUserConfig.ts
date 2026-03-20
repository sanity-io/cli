import {mkdirSync} from 'node:fs'
import {homedir} from 'node:os'
import {dirname, join as joinPath} from 'node:path'

import {z} from 'zod'

import {debug} from '../debug.js'
import {readJsonFileSync} from '../util/readJsonFileSync.js'
import {writeJsonFileSync} from '../util/writeJsonFileSync.js'

const cliUserConfigSchema = {
  authToken: z.string().optional(),
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
  const config = readConfig()
  const result = cliUserConfigSchema.authToken.safeParse(value)
  if (!result.success) {
    const message = result.error.issues
      .map(({message, path}) => `[${path.join('.')}] ${message}`)
      .join('\n')

    throw new Error(`Invalid value for config property "${prop}": ${message}`)
  }

  const configPath = getCliUserConfigPath()
  mkdirSync(dirname(configPath), {recursive: true})

  // When value is undefined, explicitly delete the key rather than relying
  // on JSON.stringify silently dropping undefined values.
  if (value === undefined) {
    const {[prop]: _, ...rest} = config
    writeJsonFileSync(configPath, rest, {pretty: true})
  } else {
    writeJsonFileSync(configPath, {...config, [prop]: value}, {pretty: true})
  }
}

/**
 * Get the config value for the given property
 *
 * @param prop - The property to get the value for
 * @returns The value of the given property
 * @internal
 */
export function getCliUserConfig(prop: 'authToken'): string | undefined {
  const config = readConfig()
  const result = cliUserConfigSchema.authToken.safeParse(config[prop])
  if (!result.success) {
    debug('Ignoring invalid stored value for "%s", returning undefined', prop)
    return undefined
  }

  return result.data
}

/**
 * A raw key-value store for CLI user configuration.
 * Unlike the typed `getCliUserConfig`/`setCliUserConfig`, this operates on
 * arbitrary keys without schema validation.
 *
 * @public
 */
export interface ConfigStore {
  /** Remove a key from the config file. */
  delete: (key: string) => void
  /** Read a value by key. Returns `undefined` if the key does not exist. */
  get: (key: string) => unknown
  /** Write a value by key, merging it into the existing config. */
  set: (key: string, value: unknown) => void
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
  return {
    get(key: string): unknown {
      const config = readConfig()
      return config[key]
    },

    set(key: string, value: unknown): void {
      const config = readConfig()
      const configPath = getCliUserConfigPath()
      mkdirSync(dirname(configPath), {recursive: true})
      writeJsonFileSync(configPath, {...config, [key]: value}, {pretty: true})
    },

    delete(key: string): void {
      const config = readConfig()
      const {[key]: _, ...rest} = config
      const configPath = getCliUserConfigPath()
      mkdirSync(dirname(configPath), {recursive: true})
      writeJsonFileSync(configPath, rest, {pretty: true})
    },
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
  try {
    const config = readJsonFileSync(getCliUserConfigPath())
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
 * Get the file system location for the CLI user configuration file.
 * Takes into account the active environment (staging vs production).
 * The file is located in the user's home directory under the `.config` directory.
 *
 * @returns The path to the CLI configuration file.
 * @internal
 */
function getCliUserConfigPath() {
  const sanityEnvSuffix = process.env.SANITY_INTERNAL_ENV === 'staging' ? '-staging' : ''
  const cliConfigPath =
    process.env.SANITY_CLI_CONFIG_PATH ||
    joinPath(homedir(), '.config', `sanity${sanityEnvSuffix}`, 'config.json')

  return cliConfigPath
}
