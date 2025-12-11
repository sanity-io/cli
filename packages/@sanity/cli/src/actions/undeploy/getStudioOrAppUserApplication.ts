import {type CliConfig, type Output} from '@sanity/cli-core'

import {getUserApplication} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {determineIsApp} from '../../util/determineIsApp.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

interface GetStudioOrAppUserApplicationOptions {
  cliConfig: CliConfig
  output: Output
}

export const NO_APP_ID = 'NO_APP_ID'
export const NO_APP_ID_OR_STUDIO_HOST = 'NO_APP_ID_OR_STUDIO_HOST'

// Used only in undeploy flow
export async function getStudioOrAppUserApplication(options: GetStudioOrAppUserApplicationOptions) {
  const {cliConfig} = options
  const isApp = determineIsApp(cliConfig)

  if (isApp) {
    const appId = getAppId(cliConfig)
    if (!appId) {
      throw new Error(NO_APP_ID)
    }

    return getUserApplication({appId, isSdkApp: true})
  }

  if (!cliConfig.studioHost && !cliConfig.deployment?.appId) {
    throw new Error(NO_APP_ID_OR_STUDIO_HOST)
  }

  if (!cliConfig.api?.projectId) {
    throw new Error(NO_PROJECT_ID)
  }

  return getUserApplication({
    appHost: cliConfig.studioHost,
    appId: cliConfig.deployment?.appId,
    isSdkApp: false,
  })
}
