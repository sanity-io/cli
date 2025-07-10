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

    return getUserApplication({appId})
  }

  if (!cliConfig.studioHost) {
    throw new Error(NO_STUDIO_HOST)
  }

  if (!cliConfig.api?.projectId) {
    throw new Error(
      `sanity.cli.ts does not contain a project identifier ("api.projectId"), which is required for the Sanity CLI to communicate with the Sanity API`,
    )
  }

  return getUserApplication({appHost: cliConfig.studioHost, projectId: cliConfig.api?.projectId})
}
