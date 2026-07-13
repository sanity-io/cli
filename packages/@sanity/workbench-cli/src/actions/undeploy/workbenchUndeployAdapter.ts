import {
  type UndeployAdapter,
  type UndeployApplicationTarget,
  type UndeployConfigTarget,
  type UndeployTargetResolution,
} from '@sanity/cli-core/undeploy'
import {getCoreAppUrl} from '@sanity/cli-core/util'

import {type DeployedExpose, summarizeExposes} from '../deploy/buildExposes.js'
import {resolveInstallationId, summarizeConfig} from '../deploy/deployConfig.js'
import {getApplication} from '../deploy/deployWorkbenchApp.js'
import {type DeployableWorkbenchApp} from '../deploy/getWorkbench.js'
import {deleteApplication, deleteConfig, listConfigs} from './undeployWorkbenchApp.js'

/** The workbench extension of the shared target; serializes into `--json` as-is. */
export type WorkbenchUndeployTarget =
  | (UndeployApplicationTarget & {
      /** Interfaces (views and services) registered by the application. */
      interfaces: DeployedExpose[]
    })
  | (UndeployConfigTarget & {
      /** The deployed config snapshots an undeploy deletes. */
      configs: {
        createdAt: string | null
        deployedBy: string | null
        id: string
      }[]
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

  const {exposes, lines} = summarizeExposes(workbench)
  return {
    target: {
      activeDeployment: null,
      appHost: application.slug,
      createdAt: null,
      deletes: 'application',
      id: application.id,
      interfaces: exposes,
      organizationId: application.organizationId,
      projectId: null,
      summary: [
        ...lines,
        ...(workbench.isSingleton === undefined ? [] : [`Singleton: ${workbench.isSingleton}`]),
      ],
      title: application.title,
      type,
      url:
        type === 'studio'
          ? application.slug
            ? `https://${application.slug}.sanity.studio`
            : null
          : getCoreAppUrl(application.organizationId, application.id),
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

  // At most one snapshot is active (served); the rest are deactivated history.
  const active = configs.find((snapshot) => snapshot.isActive)
  return {
    installationId,
    resolution: {
      target: {
        activeDeployment: active
          ? {deployedAt: active.createdAt ?? '', deployedBy: active.deployedBy ?? ''}
          : null,
        appHost: null,
        configs: configs.map((snapshot) => ({
          createdAt: snapshot.createdAt ?? null,
          deployedBy: snapshot.deployedBy ?? null,
          id: snapshot.id,
        })),
        createdAt: configs.at(-1)?.createdAt ?? null,
        deletes: 'config',
        id: null,
        organizationId,
        projectId: null,
        summary: config ? [summarizeConfig(config)] : undefined,
        title: workbench.name,
        type: 'coreApp',
        url: null,
      },
      type: 'found',
    },
  }
}
