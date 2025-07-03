import {type CliConfig} from '../../config/cli/types.js'
import {getUserApplication} from '../../services/userApplications.js'
import {determineIsApp} from '../../util/determineIsApp.js'

interface GetStudioOrAppUserApplicationOptions {
  cliConfig: CliConfig
}

export const NO_APP_ID = 'NO_APP_ID'
export const NO_STUDIO_HOST = 'NO_STUDIO_HOST'

export async function getStudioOrAppUserApplication(options: GetStudioOrAppUserApplicationOptions) {
  const {cliConfig} = options
  const isApp = determineIsApp(cliConfig)

  if (isApp) {
    const appId = 'app' in cliConfig ? cliConfig.app?.id : undefined
    if (!appId) {
      throw new Error(NO_APP_ID)
    }

    return getUserApplication({appId: cliConfig.app?.id})
  }

  console.log(cliConfig.studioHost)
  if (!cliConfig.studioHost) {
    throw new Error(NO_STUDIO_HOST)
  }

  return getUserApplication({appHost: cliConfig.studioHost})
}
