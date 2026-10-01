import {request} from './api.js'
import {type User} from './auth.js'
import {InitError, input, select, Separator, spinner} from './ui.js'

const PROJECTS_API_VERSION = '2025-09-22'
const CREATE_PROJECT_API_VERSION = 'v2025-05-14'
const ORGANIZATIONS_API_VERSION = 'v2025-05-14'

interface Project {
  createdAt: string
  displayName: string
  id: string

  metadata?: Record<string, unknown>
  organizationId?: string | null
}

interface Organization {
  id: string
  name: string
  slug: string | null
}

export interface SelectedProject {
  displayName: string
  isFirstProject: boolean
  projectId: string

  organizationId?: string
}

async function listProjects(): Promise<Project[]> {
  const projects = await request<Project[]>({
    apiVersion: PROJECTS_API_VERSION,
    query: {onlyExplicitMembership: 'true'},
    url: '/projects',
  })
  return projects.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function listOrganizations(): Promise<Organization[]> {
  return request<Organization[]>({apiVersion: ORGANIZATIONS_API_VERSION, url: '/organizations'})
}

async function createProject(options: {
  displayName: string
  organizationId?: string
}): Promise<{displayName: string; projectId: string}> {
  const response = await request<{id?: string; projectId?: string}>({
    apiVersion: CREATE_PROJECT_API_VERSION,
    body: {...options, metadata: {integration: 'cli'}},
    method: 'POST',
    url: '/projects',
  })
  return {displayName: options.displayName, projectId: (response.projectId || response.id)!}
}

async function hasProjectAttachGrant(organizationId: string): Promise<boolean> {
  try {
    const grants = await request<Record<string, {grants?: {name: string}[]}[]>>({
      apiVersion: ORGANIZATIONS_API_VERSION,
      url: `/organizations/${organizationId}/grants`,
    })
    return (grants['sanity.organization.projects'] ?? []).some((resource) =>
      resource.grants?.some((grant) => grant.name === 'attach'),
    )
  } catch {
    // No access (e.g. implicit membership) or a failed lookup both mean no attach grant
    return false
  }
}

function validateOrganizationName(name: string): string | true {
  if (!name || name.trim() === '') return 'Organization name cannot be empty'
  if (name.length > 100) return 'Organization name cannot be longer than 100 characters'
  return true
}

async function promptForNewOrganization(user: User): Promise<string> {
  const name = await input({
    default: user.name,
    message: 'Organization name:',
    validate: validateOrganizationName,
  })
  const spin = spinner('Creating organization').start()
  const organization = await request<{id: string}>({
    apiVersion: ORGANIZATIONS_API_VERSION,
    body: {name: name.trim()},
    method: 'post',
    url: '/organizations',
  })
  spin.succeed()
  return organization.id
}

async function promptForOrganization(
  organizations: Organization[],
  user: User,
): Promise<string | undefined> {
  if (organizations.length === 0) return promptForNewOrganization(user)

  const withGrants = await Promise.all(
    organizations.map(async (organization) => ({
      hasAttachGrant: await hasProjectAttachGrant(organization.id),
      organization,
    })),
  )
  const withAttach = withGrants.filter(({hasAttachGrant}) => hasAttachGrant)
  const defaultOrganizationId =
    withAttach.length === 1
      ? withAttach[0].organization.id
      : organizations.find((org) => org.name === user.name)?.id

  const chosen = await select({
    choices: [
      {name: 'Create new organization', value: '-new-'},
      new Separator(),
      ...withGrants.map(({hasAttachGrant, organization}) => ({
        disabled: hasAttachGrant ? false : 'Insufficient permissions',
        name: `${organization.name} [${organization.id}]`,
        value: organization.id,
      })),
    ],
    default: defaultOrganizationId,
    message: 'Select organization:',
  })
  if (chosen === '-new-') return promptForNewOrganization(user)
  return chosen || undefined
}

async function promptForProjectCreation(options: {
  organizationId: string | undefined
  organizations: Organization[]
  user: User
}): Promise<{displayName: string; organizationId?: string; projectId: string}> {
  const projectName = await input({
    default: 'My Sanity Project',
    message: 'Project name:',
    validate(value) {
      if (!value || value.trim() === '') return 'Project name cannot be empty'
      if (value.length > 80) return 'Project name cannot be longer than 80 characters'
      return true
    },
  })
  const organizationId =
    options.organizationId || (await promptForOrganization(options.organizations, options.user))
  const created = await createProject({displayName: projectName, organizationId})
  return {...created, organizationId}
}

/** Select an existing project or create a new one, like `sanity init` */
export async function getOrCreateProject(options: {
  organization: string | undefined
  project: string | undefined
  unattended: boolean
  user: User
}): Promise<SelectedProject> {
  const {organization, project, unattended, user} = options
  let projects: Project[]
  let organizations: Organization[] = []
  try {
    if (project) {
      projects = await listProjects()
    } else {
      ;[projects, organizations] = await Promise.all([listProjects(), listOrganizations()])
    }
  } catch (error) {
    if (unattended && project) {
      return {
        displayName: 'Unknown project',
        isFirstProject: false,
        organizationId: organization,
        projectId: project,
      }
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new InitError(`Failed to communicate with the Sanity API:\n${message}`)
  }

  if (projects.length === 0 && unattended) throw new InitError('No projects found for current user')

  if (project) {
    const match = projects.find((candidate) => candidate.id === project)
    if (!match) {
      throw new InitError(
        `Given project ID (${project}) not found, or you do not have access to it`,
      )
    }
    return {
      displayName: match.displayName,
      isFirstProject: false,
      organizationId: match.organizationId ?? undefined,
      projectId: project,
    }
  }

  if (organization) {
    const org = organizations.find((o) => o.id === organization || o.slug === organization)
    if (!org) {
      throw new InitError(
        `Given organization ID (${organization}) not found, or you do not have access to it`,
      )
    }
    if (!(await hasProjectAttachGrant(organization))) {
      throw new InitError(
        'You lack the necessary permissions to attach a project to this organization',
      )
    }
  }

  const isFirstProject = projects.length === 0
  const create = async () => ({
    ...(await promptForProjectCreation({organizationId: organization, organizations, user})),
    isFirstProject,
  })
  if (isFirstProject) return create()

  const selected = await select({
    choices: [
      {name: 'Create new project', value: 'new'},
      new Separator(),
      ...projects.map((candidate) => ({
        name: `${candidate.displayName} (${candidate.id})`,
        value: candidate.id,
      })),
    ],
    message: 'Create a new project or select an existing one',
  })
  if (selected === 'new') return create()

  const match = projects.find((candidate) => candidate.id === selected)
  return {
    displayName: match?.displayName || '',
    isFirstProject,
    organizationId: match?.organizationId ?? undefined,
    projectId: selected,
  }
}

/** `--project-name`: create the project up front, in the given or a prompted organization */
export async function createProjectFromName(options: {
  name: string
  organization: string | undefined
  user: User
}): Promise<string> {
  const organizationId =
    options.organization ?? (await promptForOrganization(await listOrganizations(), options.user))
  const created = await createProject({displayName: options.name.trim(), organizationId})
  return created.projectId
}

/** Best-effort project metadata, as recorded by `sanity init` */
export async function recordProjectInit(projectId: string, templateName: string): Promise<void> {
  const url = `/projects/${projectId}`
  const patch = (metadata: Record<string, string>) =>
    request({
      apiVersion: PROJECTS_API_VERSION,
      body: {metadata},
      method: 'PATCH',
      projectId,
      url,
    })
  // Sequential, so the two metadata patches can't race each other
  try {
    const current = await request<Project>({apiVersion: PROJECTS_API_VERSION, projectId, url})
    if (!current?.metadata?.cliInitializedAt) {
      await patch({cliInitializedAt: new Date().toISOString()})
    }
  } catch {
    // Non-critical
  }
  await patch({initialTemplate: `cli-${templateName}`}).catch(() => {})
}
