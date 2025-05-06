/**
 * These are needed for backwards compatibility with the old CLI!
 * To be implemented!
 */

// @todo implement
export function loadEnv(
  mode: string,
  envDir: string,
  _prefixes: string[] = ['VITE_'],
): Record<string, string> {
  return {}
}

export {createCliConfig} from './config/cli/createCliConfig.js'
export {defineCliConfig} from './config/cli/defineCliConfig.js'
export {getCliConfig} from './config/cli/getCliConfig.js'
