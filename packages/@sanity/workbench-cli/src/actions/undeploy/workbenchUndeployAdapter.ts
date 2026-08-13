import {
  type UndeployAdapter,
  type UndeployApplicationTarget,
  type UndeployConfigTarget,
  type UndeployTargetResolution,
} from '@sanity/cli-core/undeploy'

import {
  deleteApplication,
  getApplication,
  getApplicationUrl,
  getWorkbenchUrl,
} from '../../services/applications.js'
import {type ConfigSnapshot, deleteConfig, listConfigs} from '../../services/installations.js'
import {resolveInstallationId, summarizeConfig} from '../deploy/deployConfig.js'
import {type DeployableWorkbenchApp} from '../deploy/getWorkbench.js'
import {type DeployedInterface, summarizeInterfaces} from '../deploy/summarizeInterfaces.js'

/** The workbench extension of the shared target; serializes into `--json` as-is. */
export type WorkbenchUndeployTarget =
  | (UndeployApplicationTarget & {
      services: DeployedInterface[]
      views: DeployedInterface[]
    })
  | (UndeployConfigTarget & {
      configs: ConfigSnapshot[]
    })

/**
 * The undeploy adapter for workbench apps, mirroring what a workbench deploy
 * creates: apps that expose interfaces delete their Brett application (the
 * server soft-deletes its deployments and refuses singletons with active
 * installations); a singleton without interfaces — the media library — deletes
 * its installation's config snapshots instead.
 */
export function createWorkbenchUndeployAdapter(options: {
  appId: string | undefined
  organizationId: string | undefined
  type: 'coreApp' | 'studio'
  workbench: DeployableWorkbenchApp
}): UndeployAdapter<WorkbenchUndeployTarget> {
  const {appId, organizationId, type, workbench} = options
  // Keyed on singleton-ness, not on a locally declared config, so an undeploy
  // still reaches the server's config snapshots after the fields are removed
  // from sanity.cli.ts.
  const configOnly = !!workbench.isSingleton && !workbench.hasInterfaces
  // Workbench-internal, so kept off the reported target; resolveTarget stashes it for the delete.
  let installationId: string | undefined

  return {
    resolveTarget: async () => {
      if (!configOnly) return resolveApplicationTarget({appId, type, workbench})
      const resolved = await resolveConfigTarget({organizationId, workbench})
      installationId = resolved.installationId
      return resolved.resolution
    },
    type,
    async undeploy(target) {
      if (target.deletes === 'config') {
        if (!installationId) throw new Error('No installation resolved for the config undeploy')
        for (const snapshot of target.configs) {
          await deleteConfig(installationId, snapshot.id)
        }
        return
      }
      await deleteApplication(target.id)
    },
  }
}

async function resolveApplicationTarget({
  appId,
  type,
  workbench,
}: {
  appId: string | undefined
  type: 'coreApp' | 'studio'
  workbench: DeployableWorkbenchApp
}): Promise<UndeployTargetResolution<WorkbenchUndeployTarget>> {
  if (!appId) {
    return {
      message: 'No `deployment.appId` configured',
      solution: 'Add `deployment.appId` to sanity.cli.ts',
      type: 'none',
    }
  }

  const application = await getApplication(appId)
  if (!application) {
    return {message: 'Application with the given ID does not exist', type: 'none'}
  }

  const {lines, services, views} = summarizeInterfaces(workbench)
  return {
    target: {
      application,
      deletes: 'application',
      id: application.id,
      payload: {appId: application.id, services, type, views},
      services,
      summary: [
        ...lines,
        ...(workbench.isSingleton === undefined ? [] : [`Singleton: ${workbench.isSingleton}`]),
      ],
      title: application.title,
      type,
      url: getApplicationUrl({...application, type}),
      views,
    },
    type: 'found',
  }
}

async function resolveConfigTarget({
  organizationId,
  workbench,
}: {
  organizationId: string | undefined
  workbench: DeployableWorkbenchApp
}): Promise<{
  installationId?: string
  resolution: UndeployTargetResolution<WorkbenchUndeployTarget>
}> {
  const config = workbench.config
  const appType = config?.appType ?? workbench.applicationType
  if (!appType) throw new Error('The app declares no app type to resolve its installation')
  if (!organizationId) {
    throw new Error(
      'sanity.cli.ts does not contain an organization identifier ("app.organizationId"), which is required to resolve the installation',
    )
  }

  const installationId = await resolveInstallationId({appType, organizationId})
  if (!installationId) {
    return {
      resolution: {
        message: `No active "${appType}" installation for organization "${organizationId}"`,
        type: 'none',
      },
    }
  }

  const configs = await listConfigs(installationId)
  if (configs.length === 0) {
    return {
      installationId,
      resolution: {
        message: `No deployed config for the "${appType}" installation`,
        type: 'none',
      },
    }
  }

  return {
    installationId,
    resolution: {
      target: {
        configs,
        deletes: 'config',
        id: null,
        payload: {
          appId: null,
          ...(config ? {config: summarizeConfig(config)} : {}),
          type: 'coreApp',
        },
        summary: config ? [summarizeConfig(config)] : [],
        title: workbench.slug,
        type: 'coreApp',
        url: getWorkbenchUrl(organizationId),
      },
      type: 'found',
    },
  }
}
