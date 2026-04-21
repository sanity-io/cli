import {styleText} from 'node:util'

import {type CliConfig, type Output} from '@sanity/cli-core'

interface Options {
  cliConfig: CliConfig
  output: Output
}

function getDeploymentAppId(cliConfig: CliConfig): string | undefined {
  const id = cliConfig?.deployment?.appId
  return id
}

function getDeprecatedAppId(cliConfig: CliConfig): string | undefined {
  const id = cliConfig?.app?.id
  return id
}

function hasNewAppId(cliConfig: CliConfig) {
  return Boolean(getDeploymentAppId(cliConfig))
}

function hasDeprecatedAppId(cliConfig: CliConfig) {
  return Boolean(getDeprecatedAppId(cliConfig))
}

/**
 * Checks if an SDK app uses the deprecated app.id config & throws a warning if so.
 * @remarks Throws an error if an app uses both deployment.appId and app.id
 * @internal
 */
export function checkForDeprecatedAppId({cliConfig, output}: Options): void {
  const hasNew = hasNewAppId(cliConfig)
  const hasOld = hasDeprecatedAppId(cliConfig)

  // Throw an error if both the old and new app ID configs are found
  if (hasOld && hasNew) {
    output.error(
      `${styleText('bold', 'Found both app.id (deprecated) and deployment.appId in your application configuration.')}

Please remove app.id from your sanity.cli.js or sanity.cli.ts file.`,
      {
        exit: 1,
      },
    )
  }

  // Just warn if only the old app ID config is found
  if (hasOld) {
    output.warn(
      `${styleText('bold', 'The `app.id` config has moved to `deployment.appId`.')}

Please update \`sanity.cli.ts\` or \`sanity.cli.js\` and move:
${styleText('red', `app: {id: "${getDeprecatedAppId(cliConfig)}", ... }`)}
to
${styleText('green', `deployment: {appId: "${getDeprecatedAppId(cliConfig)}", ... }`)}
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
  const hasNew = hasNewAppId(cliConfig)
  const hasOld = hasDeprecatedAppId(cliConfig)

  if (hasNew) {
    return getDeploymentAppId(cliConfig)
  }

  if (hasOld) {
    return getDeprecatedAppId(cliConfig)
  }

  return undefined
}
