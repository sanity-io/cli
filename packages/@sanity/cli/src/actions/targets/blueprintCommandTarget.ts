import {ProjectRootNotFoundError, type SanityCommandInterface} from '@sanity/cli-core'

import {promptForProject} from '../../prompts/promptForProject.js'
import {type RequiredPermission} from '../../types/grants.js'
import {resolveCommandTarget} from './resolveCommandTarget.js'

type TargetCommand = Pick<SanityCommandInterface, 'getCliConfig' | 'getProjectId' | 'isUnattended'>

interface TargetFlags {
  dataset?: string
  project?: string
  'with-blueprints'?: boolean
}

export async function resolveProjectForCommand(
  command: TargetCommand,
  flags: TargetFlags,
  requiredProjectPermissions?: RequiredPermission[],
): Promise<string> {
  if (!flags['with-blueprints']) {
    return command.getProjectId({
      fallback: () =>
        promptForProject(
          requiredProjectPermissions ? {requiredPermissions: requiredProjectPermissions} : {},
        ),
    })
  }

  const {projectId} = await resolveCommandTarget({
    loadCliConfig: () => tryLoadConfig(command),
    project: flags.project,
    requiredProjectPermissions,
    unattended: command.isUnattended(),
  })
  return projectId
}

export async function getBlueprintDatasetTarget(
  command: TargetCommand,
  flags: TargetFlags,
  options: {datasetUsage?: string; requiredProjectPermissions?: RequiredPermission[]} = {},
) {
  if (!flags['with-blueprints']) return
  return resolveCommandTarget({
    ...options,
    dataset: flags.dataset,
    loadCliConfig: () => tryLoadConfig(command),
    needsDataset: true,
    project: flags.project,
    unattended: command.isUnattended(),
  })
}

async function tryLoadConfig(command: TargetCommand) {
  try {
    return await command.getCliConfig()
  } catch (error) {
    if (error instanceof ProjectRootNotFoundError) return {}
    throw error
  }
}
