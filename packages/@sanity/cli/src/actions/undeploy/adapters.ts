import {type CliConfig} from '@sanity/cli-core'
import {
  type UndeployAdapter,
  type UndeployApplicationTarget,
  type UndeployTarget,
} from '@sanity/cli-core/undeploy'
import {getCoreAppUrl} from '@sanity/cli-core/util'

import {
  deleteUserApplication,
  getUserApplication,
  type UserApplication,
} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

export function createAppUndeployAdapter(
  cliConfig: CliConfig,
): UndeployAdapter<UndeployApplicationTarget> {
  return {
    async resolveTarget() {
      const appId = getAppId(cliConfig)
      if (!appId) {
        return {
          message: 'No `deployment.appId` configured',
          solution: 'Add `deployment.appId` to sanity.cli.ts',
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
    undeploy: ({id}) => deleteUserApplication({applicationId: id, appType: 'coreApp'}),
  }
}

export function createStudioUndeployAdapter(
  cliConfig: CliConfig,
): UndeployAdapter<UndeployApplicationTarget> {
  return {
    async resolveTarget() {
      const appId = cliConfig.deployment?.appId
      const studioHost = cliConfig.studioHost
      if (!appId && !studioHost) {
        return {
          message: 'No studio hostname configured',
          solution: 'Set `studioHost` in sanity.cli.ts',
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
    undeploy: ({id}) => deleteUserApplication({applicationId: id, appType: 'studio'}),
  }
}

function toUndeployTarget(
  application: UserApplication,
  type: UndeployTarget['type'],
): UndeployApplicationTarget {
  return {
    activeDeployment: application.activeDeployment
      ? {
          deployedAt: application.activeDeployment.deployedAt,
          deployedBy: application.activeDeployment.deployedBy,
        }
      : null,
    appHost: application.appHost ?? null,
    createdAt: application.createdAt ?? null,
    deletes: 'application',
    id: application.id,
    organizationId: application.organizationId ?? null,
    projectId: application.projectId ?? null,
    title: application.title ?? null,
    type,
    url: resolveTargetUrl(application, type),
  }
}

function resolveTargetUrl(
  application: UserApplication,
  type: UndeployTarget['type'],
): string | null {
  if (type === 'coreApp') {
    return application.organizationId
      ? getCoreAppUrl(application.organizationId, application.id)
      : null
  }
  if (!application.appHost) return null
  return application.urlType === 'external'
    ? application.appHost
    : `https://${application.appHost}.sanity.studio`
}
