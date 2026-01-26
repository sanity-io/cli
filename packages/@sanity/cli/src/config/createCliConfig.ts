import {type CliConfig, cliConfigSchema} from '@sanity/cli-core'

/**
 * @deprecated Use `defineCliConfig` instead
 * @public
 */
export function createCliConfig(config: CliConfig) {
  return cliConfigSchema.parse(config)
}
