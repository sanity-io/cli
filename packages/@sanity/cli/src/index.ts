/**
 * These are needed for backwards compatibility with the old CLI!
 * To be implemented!
 */

// @todo implement
export function getCliClient(_options: any): any {
  throw new Error('@todo not implemented yet')
}

// @todo implement typings
export function defineCliConfig(config: any) {
  return config
}

// @todo implement typings
export function createCliConfig(config: any) {
  return config
}

// @todo implement
export function loadEnv(
  mode: string,
  envDir: string,
  _prefixes: string[] = ['VITE_'],
): Record<string, string> {
  return {}
}
