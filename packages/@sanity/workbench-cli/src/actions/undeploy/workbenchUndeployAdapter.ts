import {
  type UndeployAdapter,
  type UndeployApplicationTarget,
  type UndeployConfigTarget,
  type UndeployTargetResolution,
} from '@sanity/cli-core/undeploy'

import {type ResolvedMediaLibraryConfig} from '../../resolveWorkbenchConfig.js'
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
 * The undeploy adapter for workbench apps and configs, mirroring what a
 * workbench deploy creates: an app that exposes interfaces deletes its Brett
 * application (the server soft-deletes its deployments and refuses singletons
 * with active installations); a config — the media library — deletes its
 * installation's config snapshots instead. The two are severed at the source,
 * so exactly one of `workbench`/`config` is supplied and the brand decides the path.
 */
export function createWorkbenchUndeployAdapter(options: {
  appId: string | undefined
  config?: ResolvedMediaLibraryConfig
  organizationId: string | undefined
  type: 'coreApp' | 'studio'
  workbench?: DeployableWorkbenchApp
}): UndeployAdapter<WorkbenchUndeployTarget> {
  const {appId, config, organizationId, type, workbench} = options
  // Workbench-internal, so kept off the reported target; resolveTarget stashes it for the delete.
  let installationId: string | undefined

  return {
    resolveTarget: async () => {
      if (!config) {
        if (!workbench) throw new Error('No workbench app or config to undeploy')
        return resolveApplicationTarget({appId, type, workbench})
      }
      const resolved = await resolveConfigTarget({config, organizationId})
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
      summary: lines,
      title: application.title,
      type,
      url: getApplicationUrl({...application, type}),
      views,
    },
    type: 'found',
  }
}

async function resolveConfigTarget({
  config,
  organizationId,
}: {
  config: ResolvedMediaLibraryConfig
  organizationId: string | undefined
}): Promise<{
  installationId?: string
  resolution: UndeployTargetResolution<WorkbenchUndeployTarget>
}> {
  const {appType} = config
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
          config: summarizeConfig(config),
          type: 'coreApp',
        },
        summary: [summarizeConfig(config)],
        title: appType,
        type: 'coreApp',
        url: getWorkbenchUrl(organizationId),
      },
      type: 'found',
    },
  }
}
