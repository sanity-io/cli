import {type CliConfig} from '@sanity/cli-core'

import {type DeployFlags} from '../deploy/types.js'
import {type BuildFlags} from './types.js'

interface AutoUpdateSources {
  cliConfig: CliConfig
  flags: BuildFlags | DeployFlags
}

/**
 * Compares parameters from various sources to determine whether or not to auto-update
 * @param sources - The sources of the auto-update parameter, including CLI flags and the CLI config
 * @returns boolean
 * @internal
 */
export function shouldAutoUpdate({cliConfig, flags}: AutoUpdateSources): boolean {
  // cli flags (for example, '--no-auto-updates') should take precedence
  if ('auto-updates' in flags) {
    return Boolean(flags['auto-updates'])
  }

  if (cliConfig && 'autoUpdates' in cliConfig) {
    return Boolean(cliConfig.autoUpdates)
  }

  return false
}
