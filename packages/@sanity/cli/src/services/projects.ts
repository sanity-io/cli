import {debug, getGlobalCliClient, getProjectCliClient} from '@sanity/cli-core'
import {SanityProject} from '@sanity/client'

import {type Invite, type Role} from '../actions/users/types.js'

export const PROJECTS_API_VERSION = '2025-09-22'

export const CREATE_PROJECT_API_VERSION = 'v2025-05-14'

const UNCLAIMED_PROJECT_ORGANIZATION_ID = 'oSystemUnclaimed'

export type ProjectClaimStatus = 'claimed' | 'unclaimed' | 'unknown'

interface CreateProjectOptions {
  displayName: string

  metadata?: {
    coupon?: string
    integration?: string
  }
  organizationId?: string
  subscription?: {planId: string}
}

export interface CreateProjectResult {
  displayName: string
  projectId: string
}

/**
 * Create a new Sanity project
 */
export async function createProject(options: CreateProjectOptions): Promise<CreateProjectResult> {
  const client = await getGlobalCliClient({
    apiVersion: CREATE_PROJECT_API_VERSION,
    requireUser: true,
  })

  try {
    const response = await client.request({
      body: {
        ...options,
        metadata: {
          ...options?.metadata,
          integration: 'cli',
        },
      },
      method: 'POST',
      url: '/projects',
    })

    return {
      displayName: options.displayName || '',
      projectId: response.projectId || response.id,
    }
  } catch (err) {
    debug('Error creating project', err)
    throw err
  }
}

export async function getProjectById(projectId: string) {
  const client = await getProjectCliClient({
    apiVersion: PROJECTS_API_VERSION,
    projectId,
    requireUser: true,
  })

  return client.projects.getById(projectId)
}

export async function getProjectClaimStatus(
  projectId: string,
  token: string,
): Promise<ProjectClaimStatus> {
  try {
    const client = await getProjectCliClient({
      apiVersion: PROJECTS_API_VERSION,
      projectId,
      requireUser: true,
      token,
    })
    const project = await client.projects.getById(projectId)

    if (typeof project.organizationId !== 'string' || project.organizationId.length === 0) {
      return 'unknown'
    }

    return project.organizationId === UNCLAIMED_PROJECT_ORGANIZATION_ID ? 'unclaimed' : 'claimed'
  } catch (error) {
    debug(
      'failed to check claim status for project %s: %s',
      projectId,
      error instanceof Error ? error.message : `${error}`,
    )
    return 'unknown'
  }
}

export async function getProjectRoles(projectId: string) {
  const client = await getGlobalCliClient({
    apiVersion: PROJECTS_API_VERSION,
    requireUser: true,
  })

  return client.request<Role[]>({url: `/projects/${projectId}/roles`})
}

interface InviteUserOptions {
  email: string
  projectId: string
  role: string
}

export async function inviteUser({email, projectId, role}: InviteUserOptions) {
  const client = await getGlobalCliClient({
    apiVersion: PROJECTS_API_VERSION,
    requireUser: true,
  })

  return client.request({
    body: {email, role},
    maxRedirects: 0,
    method: 'POST',
    url: `/invitations/project/${projectId}`,
    useGlobalApi: true,
  })
}

export async function listProjects({
  onlyExplicitMembership = true,
}: {
  onlyExplicitMembership?: boolean
} = {}) {
  const client = await getGlobalCliClient({
    apiVersion: PROJECTS_API_VERSION,
    requireUser: true,
  })

  return client.projects.list({onlyExplicitMembership})
}

export async function getProjectInvites(projectId: string) {
  const client = await getGlobalCliClient({
    apiVersion: PROJECTS_API_VERSION,
    requireUser: true,
  })

  return client.request<Invite[]>({url: `/invitations/project/${projectId}`})
}

export async function updateProjectInitializedAt(projectId: string) {
  const client = await getProjectCliClient({
    apiVersion: PROJECTS_API_VERSION,
    projectId,
    requireUser: true,
  })

  const project = await client.request<SanityProject>({url: `/projects/${projectId}`})

  if (!project?.metadata?.cliInitializedAt) {
    await client.request({
      body: {metadata: {cliInitializedAt: new Date().toISOString()}},
      method: 'PATCH',
      url: `/projects/${projectId}`,
    })
  }
}

export async function updateProjectInitalTemplate(projectId: string, templateName: string) {
  const client = await getProjectCliClient({
    apiVersion: PROJECTS_API_VERSION,
    projectId,
    requireUser: true,
  })

  await client.request({
    body: {metadata: {initialTemplate: templateName}},
    method: 'PATCH',
    url: `/projects/${projectId}`,
  })
}
