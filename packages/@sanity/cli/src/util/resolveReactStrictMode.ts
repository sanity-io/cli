import {type CliConfig} from '@sanity/cli-core/config/cli/types/cliConfig'

export function resolveReactStrictMode(cliConfig?: CliConfig): boolean | undefined {
  if (process.env.SANITY_STUDIO_REACT_STRICT_MODE) {
    return process.env.SANITY_STUDIO_REACT_STRICT_MODE === 'true'
  }
  // Pass `undefined` through when unset so the studio runtime falls back to its
  // own default. `Boolean()` here would force strict mode off, diverging from
  // the behaviour on `main`.
  return cliConfig?.reactStrictMode
}
