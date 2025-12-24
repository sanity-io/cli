import {type CliConfig, type Output} from '@sanity/cli-core'
import {chalk} from '@sanity/cli-core/ux'

import {type DeployFlags} from '../deploy/types.js'
import {type DevFlags} from '../dev/types.js'
import {type BuildFlags} from './types.js'

interface AutoUpdateSources {
  cliConfig: CliConfig
  flags: BuildFlags | DeployFlags | DevFlags
  output: Output
}

/**
 * Compares parameters from various sources to determine whether or not to auto-update.
 * @remarks Throws an error if both the old and new auto update config are used; throws a warning if the old config is used, or if the auto updates flags are used.
 * @internal
 */
export function shouldAutoUpdate({cliConfig, flags, output}: AutoUpdateSources): boolean {
  // Auto updates in flags is deprecated; throw a warning if used
  if ('auto-updates' in flags) {
    const flagUsed = flags['auto-updates'] ? '--auto-updates' : '--no-auto-updates'
    output.warn(
      `The ${flagUsed} flag is deprecated for deploy and build commands. Set the autoUpdates option in the deployment section of sanity.cli.ts or sanity.cli.js instead.`,
    )
  }

  const hasOldConfig = cliConfig && 'autoUpdates' in cliConfig

  const hasNewConfig =
    cliConfig &&
    'deployment' in cliConfig &&
    cliConfig.deployment &&
    'autoUpdates' in cliConfig.deployment

  if (hasOldConfig && hasNewConfig) {
    output.error(
      'Found both `autoUpdates` (deprecated) and `deployment.autoUpdates` in sanity.cli.js/.ts. Please remove the deprecated top level `autoUpdates` config.',
      {
        exit: 1,
      },
    )
  }

  if (hasOldConfig) {
    output.warn('The autoUpdates config has moved to deployment.autoUpdates.')
    output.warn(`Please update sanity.cli.ts or sanity.cli.js and make the following change:
  ${chalk.red(`-  autoUpdates: ${cliConfig.autoUpdates},`)}
  ${chalk.green(`+  deployment: {autoUpdates: ${cliConfig.autoUpdates}}`)}
`)
  }

  if (hasNewConfig) {
    return Boolean(cliConfig?.deployment?.autoUpdates)
  }

  if (hasOldConfig) {
    return Boolean(cliConfig?.autoUpdates)
  }

  return false
}
