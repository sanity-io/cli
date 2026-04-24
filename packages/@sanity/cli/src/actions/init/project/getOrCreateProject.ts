import {type SanityOrgUser, subdebug} from '@sanity/cli-core'
import {select, Separator} from '@sanity/cli-core/ux'

import {listOrganizations, type ProjectOrganization} from '../../../services/organizations.js'
import {listProjects} from '../../../services/projects.js'
import {hasProjectAttachGrant} from '../../organizations/hasProjectAttachGrant.js'
import {InitError} from '../initError.js'
import {promptForProjectCreation} from './promptForProjectCreation.js'

const debug = subdebug('init')

export async function getOrCreateProject({
  coupon,
  newProject,
  organization,
  planId,
  project,
  unattended,
  user,
}: {
  coupon?: string
  newProject: string | undefined
  organization: string | undefined
  planId: string | undefined
  project: string | undefined
  unattended: boolean
  user: SanityOrgUser
}): Promise<{
  displayName: string
  isFirstProject: boolean
  organizationId?: string
  projectId: string
  userAction: 'create' | 'select'
}> {
  const projectId = project || newProject
  let projects
  let organizations: ProjectOrganization[]

  try {
    const [allProjects, allOrgs] = await Promise.all([listProjects(), listOrganizations()])
    projects = allProjects.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
    organizations = allOrgs
  } catch (err: unknown) {
    if (unattended && projectId) {
      return {
        displayName: 'Unknown project',
        isFirstProject: false,
        organizationId: organization,
        projectId,
        userAction: 'select',
      }
    }
    const message = err instanceof Error ? err.message : String(err)
    throw new InitError(`Failed to communicate with the Sanity API:\n${message}`, 1)
  }

  if (projects.length === 0 && unattended) {
    throw new InitError('No projects found for current user', 1)
  }

  if (projectId) {
    const proj = projects.find((p) => p.id === projectId)
    if (!proj) {
      throw new InitError(
        `Given project ID (${projectId}) not found, or you do not have access to it`,
        1,
      )
    }

    return {
      displayName: proj.displayName,
      isFirstProject: false,
      organizationId: proj.organizationId ?? undefined,
      projectId,
      userAction: 'select',
    }
  }

  if (organization) {
    const org =
      organizations.find((o) => o.id === organization) ||
      organizations.find((o) => o.slug === organization)

    if (!org) {
      throw new InitError(
        `Given organization ID (${organization}) not found, or you do not have access to it`,
        1,
      )
    }

    if (!(await hasProjectAttachGrant(organization))) {
      throw new InitError(
        'You lack the necessary permissions to attach a project to this organization',
        1,
      )
    }
  }

  const isUsersFirstProject = projects.length === 0
  if (isUsersFirstProject || coupon) {
    debug(
      isUsersFirstProject
        ? 'No projects found for user, prompting for name'
        : 'Using a coupon - skipping project selection',
    )

    const created = await promptForProjectCreation({
      coupon,
      isUsersFirstProject,
      organizationId: organization,
      organizations,
      planId,
      user,
    })

    return {
      ...created,
      isFirstProject: isUsersFirstProject,
      userAction: 'create',
    }
  }

  debug(`User has ${projects.length} project(s) already, showing list of choices`)

  const projectChoices = projects.map((project) => ({
    name: `${project.displayName} (${project.id})`,
    value: project.id,
  }))

  const selected = await select({
    choices: [{name: 'Create new project', value: 'new'}, new Separator(), ...projectChoices],
    message: 'Create a new project or select an existing one',
  })

  if (selected === 'new') {
    debug('User wants to create a new project, prompting for name')

    const created = await promptForProjectCreation({
      coupon,
      isUsersFirstProject,
      organizationId: organization,
      organizations,
      planId,
      user,
    })

    return {
      ...created,
      isFirstProject: isUsersFirstProject,
      userAction: 'create',
    }
  }

  debug(`Returning selected project (${selected})`)
  const selectedProject = projects.find((proj) => proj.id === selected)
  return {
    displayName: selectedProject?.displayName || '',
    isFirstProject: isUsersFirstProject,
    organizationId: selectedProject?.organizationId ?? undefined,
    projectId: selected,
    userAction: 'select',
  }
}
