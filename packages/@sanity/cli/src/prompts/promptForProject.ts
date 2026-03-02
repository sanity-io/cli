import {isInteractive, NonInteractiveError, subdebug} from '@sanity/cli-core'
import {select, Separator, spinner} from '@sanity/cli-core/ux'

import {getUserGrants} from '../services/grants.js'
import {listProjects} from '../services/projects.js'
import {type RequiredPermission} from '../types/grants.js'
import {getProjectsWithPermissions} from '../util/checkProjectPermissions.js'

const debug = subdebug('prompt:project')

interface PromptForProjectOptions {
  requiredPermissions?: RequiredPermission[]
}

/**
 * Prompt the user to select a project from their available projects.
 *
 * When `requiredPermissions` is provided, projects are filtered by grants:
 * only permitted projects are shown as selectable, with a single disabled
 * summary item indicating how many projects were hidden due to insufficient permissions.
 */
export async function promptForProject(options: PromptForProjectOptions = {}): Promise<string> {
  if (!isInteractive()) {
    throw new NonInteractiveError('select')
  }

  const {requiredPermissions} = options

  debug('Fetching projects and grants')
  const spin = spinner('Fetching available projects').start()

  const [projects, grants] = await Promise.all([
    listProjects(),
    requiredPermissions ? getUserGrants() : undefined,
  ]).catch((error) => {
    spin.fail(requiredPermissions ? 'Failed to fetch projects or permissions' : 'Failed to fetch projects')
    throw error
  })

  if (projects.length === 0) {
    spin.fail('No projects found')
    throw new Error('No projects found. Create a project at https://www.sanity.io/manage')
  }

  spin.succeed()

  const permittedIds =
    grants && requiredPermissions
      ? getProjectsWithPermissions(grants, requiredPermissions)
      : undefined

  const sorted = projects.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))

  const choices: Array<
    Separator | {disabled?: string; name: string; value: string}
  > = []
  let insufficientCount = 0

  for (const project of sorted) {
    const label = `${project.displayName} (${project.id})`
    if (permittedIds && !permittedIds.has(project.id)) {
      insufficientCount++
    } else {
      choices.push({name: label, value: project.id})
    }
  }

  if (insufficientCount > 0) {
    if (choices.length === 0) {
      throw new Error(
        'None of your projects have sufficient permissions for this operation',
      )
    }

    const suffix = insufficientCount === 1 ? 'project' : 'projects'
    choices.push(
      new Separator(),
      {
        disabled: '(insufficient permissions)',
        name: `${insufficientCount} other ${suffix} hidden`,
        value: '',
      },
    )
  }

  return select({
    choices,
    message: 'Select project',
  })
}
