import {type CliConfig} from '@sanity/cli-core'

import {
  deleteUserApplication,
  getUserApplication,
  type UserApplication,
} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'
import {getCoreAppUrl} from '../deploy/urlUtils.js'
import {type UndeployAdapter, type UndeployTarget} from './types.js'

export function createAppUndeployAdapter(cliConfig: CliConfig): UndeployAdapter {
  return {
    async resolveTarget() {
      const appId = getAppId(cliConfig)
      if (!appId) {
        return {
          message: 'No application ID provided',
          solution: 'Set `deployment.appId` in sanity.cli.js or sanity.cli.ts',
          type: 'none',
        }
      }

      const application = await getUserApplication({appId, isSdkApp: true})
      if (!application) {
        return {message: 'Application with the given ID does not exist', type: 'none'}
      }

      return {target: toUndeployTarget(application, 'coreApp'), type: 'found'}
    },
    type: 'coreApp',
    undeploy: ({applicationId}) => deleteUserApplication({applicationId, appType: 'coreApp'}),
  }
}

export function createStudioUndeployAdapter(cliConfig: CliConfig): UndeployAdapter {
  return {
    async resolveTarget() {
      const appId = cliConfig.deployment?.appId
      const studioHost = cliConfig.studioHost
      if (!appId && !studioHost) {
        return {
          message: 'No application ID or studio host provided',
          solution: 'Set `deployment.appId` in sanity.cli.js or sanity.cli.ts',
          type: 'none',
        }
      }

      const projectId = cliConfig.api?.projectId
      if (!projectId) throw new Error(NO_PROJECT_ID)

      const application = await getUserApplication({
        appHost: studioHost,
        appId,
        isSdkApp: false,
        projectId,
      })
      if (!application) {
        return {
          message:
            'Your project has not been assigned an app ID or a studio hostname, or the `appId` or `studioHost` provided does not exist',
          type: 'none',
        }
      }

      return {target: toUndeployTarget(application, 'studio'), type: 'found'}
    },
    type: 'studio',
    undeploy: ({applicationId}) => deleteUserApplication({applicationId, appType: 'studio'}),
  }
}

function toUndeployTarget(
  application: UserApplication,
  applicationType: UndeployTarget['applicationType'],
): UndeployTarget {
  return {
    activeDeployment: application.activeDeployment
      ? {
          deployedAt: application.activeDeployment.deployedAt,
          deployedBy: application.activeDeployment.deployedBy,
          version: application.activeDeployment.version,
        }
      : null,
    appHost: application.appHost ?? null,
    applicationId: application.id,
    applicationType,
    createdAt: application.createdAt ?? null,
    organizationId: application.organizationId ?? null,
    projectId: application.projectId ?? null,
    title: application.title ?? null,
    url: resolveTargetUrl(application, applicationType),
  }
}

function resolveTargetUrl(
  application: UserApplication,
  applicationType: UndeployTarget['applicationType'],
): string | null {
  if (applicationType === 'coreApp') {
    return application.organizationId
      ? getCoreAppUrl(application.organizationId, application.id)
      : null
  }
  if (!application.appHost) return null
  return application.urlType === 'external'
    ? application.appHost
    : `https://${application.appHost}.sanity.studio`
}
