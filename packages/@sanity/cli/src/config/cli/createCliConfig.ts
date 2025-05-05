import type {CliConfig} from './types.js'

/**
 * @deprecated Use `defineCliConfig` instead
 */
export function createCliConfig(config: CliConfig): CliConfig {
  return config
}
