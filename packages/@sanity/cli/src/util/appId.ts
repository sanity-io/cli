import {type CliConfig, type Output} from '@sanity/cli-core'
import chalk from 'chalk'

interface Options {
  cliConfig: CliConfig
  output: Output
}

function _getAppId(cliConfig: CliConfig): string | undefined {
  const id = cliConfig?.deployment?.appId || undefined
  return id
}

function _getDeprecatedAppId(cliConfig: CliConfig): string | undefined {
  const id = cliConfig?.app?.id || undefined
  return id
}

function _hasNewAppId(cliConfig: CliConfig) {
  return Boolean(_getAppId(cliConfig))
}

function _hasDeprecatedAppId(cliConfig: CliConfig) {
  return Boolean(_getDeprecatedAppId(cliConfig))
}

/**
 * Checks if an SDK app uses the deprecated app.id config & throws a warning if so.
 * @remarks Throws an error if an app uses both deployment.appId and app.id
 * @internal
 */
export function checkForDeprecatedAppId({cliConfig, output}: Options): void {
  const hasNew = _hasNewAppId(cliConfig)
  const hasOld = _hasDeprecatedAppId(cliConfig)

  // Throw an error if both the old and new app ID configs are found
  if (hasOld && hasNew) {
    output.error(
      `${chalk.bold('Found both app.id (deprecated) and deployment.appId in your application configuration.')}

Please remove app.id from your sanity.cli.js or sanity.cli.ts file.`,
      {
        exit: 1,
      },
    )
  }

  // Just warn if only the old app ID config is found
  if (hasOld) {
    output.warn(
      `${chalk.bold('The `app.id` config has moved to `deployment.appId`.')}

Please update \`sanity.cli.ts\` or \`sanity.cli.js\` and move:
${chalk.red(`app: {id: "${_getDeprecatedAppId(cliConfig)}", ... }`)}
to
${chalk.green(`deployment: {appId: "${_getDeprecatedAppId(cliConfig)}", ... }}`)})
`,
    )
  }
}

/**
 * Get an application's ID
 * @remarks Favors the current implementation (deployment.appId) but will fall back to the deprecated app.id
 * @internal
 */
export function getAppId(cliConfig: CliConfig): string | undefined {
  const hasNew = _hasNewAppId(cliConfig)
  const hasOld = _hasDeprecatedAppId(cliConfig)

  if (hasNew) {
    return _getAppId(cliConfig)
  }

  if (hasOld) {
    return _getDeprecatedAppId(cliConfig)
  }

  return undefined
}
