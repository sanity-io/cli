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
export const NO_STUDIO_HOST = 'NO_STUDIO_HOST'

export async function getStudioOrAppUserApplication(options: GetStudioOrAppUserApplicationOptions) {
  const {cliConfig} = options
  const isApp = determineIsApp(cliConfig)

  if (isApp) {
    const appId = getAppId(cliConfig)
    if (!appId) {
      throw new Error(NO_APP_ID)
    }

    return getUserApplication({appId})
  }

  if (!cliConfig.studioHost) {
    throw new Error(NO_STUDIO_HOST)
  }

  if (!cliConfig.api?.projectId) {
    throw new Error(NO_PROJECT_ID)
  }

  return getUserApplication({appHost: cliConfig.studioHost, projectId: cliConfig.api?.projectId})
}
