import {homedir} from 'node:os'
import {join as joinPath} from 'node:path'

import {z} from 'zod'

import {debug} from '../debug.js'
import {readJsonFile} from '../util/readJsonFile.js'
import {writeJsonFile} from '../util/writeJsonFile.js'

const cliConfigSchema = {
  authToken: z.string().optional(),
  telemetryConsent: z
    .object({
      updatedAt: z.number().optional(),
      value: z
        .object({
          status: z.enum(['undetermined', 'unset', 'granted', 'denied']),
          type: z.string(),
        })
        .passthrough(),
    })
    .optional(),
}

/**
 * The CLI configuration schema.
 *
 * @internal
 */
export type CliConfig = z.infer<z.ZodObject<typeof cliConfigSchema>>

/**
 * Set the config value for the given property.
 * Validates that the passed value adheres to the defined CLI config schema.
 *
 * @param prop - The property to set the value for
 * @param value - The value to set
 * @internal
 */
export async function setConfig<P extends keyof CliConfig>(prop: P, value: CliConfig[P]) {
  const config = await readConfig()
  const valueSchema = cliConfigSchema[prop]
  if (!valueSchema) {
    throw new Error(`No schema defined for config property "${prop}"`)
  }

  const {error, success} = valueSchema.safeParse(value)
  if (!success) {
    const message = error.issues
      .map(({message, path}) => `[${path.join('.')}] ${message}`)
      .join('\n')

    throw new Error(`Invalid value for config property "${prop}": ${message}`)
  }

  await writeJsonFile(getCliConfigPath(), {...config, [prop]: value})
}

/**
 * Get the config value for the given property
 *
 * @param prop - The property to get the value for
 * @returns The value of the given property
 * @internal
 */
export async function getConfig<P extends keyof CliConfig>(prop: P): Promise<CliConfig[P]> {
  const config = await readConfig()
  const valueSchema = cliConfigSchema[prop]
  if (!valueSchema) {
    throw new Error(`No schema defined for config property "${prop}"`)
  }

  const {error, success} = valueSchema.safeParse(config[prop])
  if (!success) {
    const message = error.issues
      .map(({message, path}) => `[${path.join('.')}] ${message}`)
      .join('\n')

    throw new Error(`Invalid value for config property "${prop}": ${message}`)
  }

  return config[prop]
}

/**
 * Read the whole configuration from file system. If the file does not exist or could
 * not be loaded, an empty configuration object is returned.
 *
 * @returns The whole CLI configuration.
 * @internal
 */
async function readConfig(): Promise<CliConfig> {
  const defaultConfig: CliConfig = {}
  try {
    const config = await readJsonFile(getCliConfigPath())
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('Invalid config file - expected an object')
    }
    return config
  } catch (err: unknown) {
    debug('Failed to read CLI config file: %s', err instanceof Error ? err.message : `${err}`)
    return defaultConfig
  }
}

/**
 * Get the file system location for the CLI configuration file.
 * Takes into account the active environment (staging vs production).
 * The file is located in the user's home directory under the `.config` directory.
 *
 * @returns The path to the CLI configuration file.
 * @internal
 */
function getCliConfigPath() {
  const sanityEnvSuffix = process.env.SANITY_INTERNAL_ENV === 'staging' ? '-staging' : ''
  const cliConfigPath =
    process.env.SANITY_CLI_CONFIG_PATH ||
    joinPath(homedir(), '.config', `sanity-${sanityEnvSuffix}`, 'config.json')

  return cliConfigPath
}
