import {type CliConfig} from '@sanity/cli-core'

export function resolveReactStrictMode(cliConfig?: CliConfig): boolean | undefined {
  if (process.env.SANITY_STUDIO_REACT_STRICT_MODE) {
    return process.env.SANITY_STUDIO_REACT_STRICT_MODE === 'true'
  }
  // Leave unset so the studio's own default applies, rather than forcing it off.
  return cliConfig?.reactStrictMode
}
