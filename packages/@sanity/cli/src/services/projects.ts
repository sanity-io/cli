import {debug, getGlobalCliClient, getProjectCliClient} from '@sanity/cli-core'

export const PROJECTS_API_VERSION = '2025-09-22'

export const CREATE_PROJECT_API_VERSION = 'v2025-05-14'

export interface CreateProjectOptions {
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
      uri: '/projects',
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
