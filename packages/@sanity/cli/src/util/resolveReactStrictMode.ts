import {type CliConfig} from '@sanity/cli-core'

export function resolveReactStrictMode(cliConfig?: CliConfig): boolean {
  if (process.env.SANITY_STUDIO_REACT_STRICT_MODE) {
    return process.env.SANITY_STUDIO_REACT_STRICT_MODE === 'true'
  }
  return Boolean(cliConfig?.reactStrictMode)
}
