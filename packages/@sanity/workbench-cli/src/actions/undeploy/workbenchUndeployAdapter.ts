import {
  type UndeployAdapter,
  type UndeployApplicationTarget,
  type UndeployConfigTarget,
  type UndeployTargetResolution,
} from '@sanity/cli-core/undeploy'
import {getCoreAppUrl} from '@sanity/cli-core/util'

import {type MediaLibraryField} from '../../defineApp.js'
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
      /** The app's explicit singleton flag; omitted when the app doesn't set it. */
      isSingleton?: boolean
    })
  | (UndeployConfigTarget & {
      /** The deployed config snapshots an undeploy deletes. */
      configs: {
        createdAt: string | null
        deployedBy: string | null
        id: string
        version: string | null
      }[]
      /** The custom fields the config declares. */
      fields: MediaLibraryField[]
      /** The installation whose config an undeploy deletes. */
      installationId: string
      isSingleton: true
    })

/**
 * The undeploy adapter for workbench apps, mirroring what a workbench deploy
 * creates: apps that expose interfaces delete their Brett application (the
 * server soft-deletes its deployments and refuses singletons with active
 * installations); a config-only singleton — a media library, or an app defined
 * with just a config — deletes its installation's config snapshots instead.
 */
export function createWorkbenchUndeployAdapter(options: {
  appId: string | undefined
  organizationId: string | undefined
  type: 'coreApp' | 'studio'
  workbench: DeployableWorkbenchApp
}): UndeployAdapter<WorkbenchUndeployTarget> {
  const {appId, organizationId, type, workbench} = options
  const configOnly = workbench.deploySingletonConfig && !workbench.hasInterfaces

  return {
    resolveTarget: () =>
      configOnly
        ? resolveConfigTarget({organizationId, workbench})
        : resolveApplicationTarget({appId, type, workbench}),
    type,
    async undeploy(target) {
      if (target.deletes === 'config') {
        for (const snapshot of target.configs) {
          await deleteConfig(target.installationId, snapshot.id)
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
      ...(workbench.isSingleton === undefined ? {} : {isSingleton: workbench.isSingleton}),
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
}): Promise<UndeployTargetResolution<WorkbenchUndeployTarget>> {
  const config = workbench.config
  if (!config) throw new Error('The app declares no config to undeploy')
  if (!organizationId) {
    throw new Error(
      'sanity.cli.ts does not contain an organization identifier ("app.organizationId"), which is required to resolve the installation',
    )
  }

  const installationId = await resolveInstallationId({appType: config.appType, organizationId})
  if (!installationId) {
    return {
      message: `No active "${config.appType}" installation for organization "${organizationId}"`,
      type: 'none',
    }
  }

  const configs = await listConfigs(installationId)
  // Snapshots come newest first; the one being served reports as the active deployment.
  const newest = configs[0]
  if (!newest) {
    return {
      message: `No deployed config for the "${config.appType}" installation`,
      type: 'none',
    }
  }

  return {
    target: {
      activeDeployment: {
        deployedAt: newest.createdAt ?? '',
        deployedBy: newest.deployedBy ?? '',
        version: newest.version ?? '',
      },
      appHost: null,
      configs: configs.map((snapshot) => ({
        createdAt: snapshot.createdAt ?? null,
        deployedBy: snapshot.deployedBy ?? null,
        id: snapshot.id,
        version: snapshot.version ?? null,
      })),
      createdAt: configs.at(-1)?.createdAt ?? null,
      deletes: 'config',
      fields: config.fields,
      id: null,
      installationId,
      isSingleton: true,
      organizationId,
      projectId: null,
      summary: [summarizeConfig(config)],
      title: workbench.name,
      type: 'coreApp',
      url: null,
    },
    type: 'found',
  }
}
