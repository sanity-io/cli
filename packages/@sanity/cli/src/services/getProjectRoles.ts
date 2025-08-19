import {SanityClient} from '@sanity/client'

import {type ProjectRole} from '../actions/tokens/types.js'

/**
 * Get all roles for a project
 * @param client - The Sanity client
 * @param projectId - The project ID
 * @returns A promise that resolves to an array of project roles
 *
 * @internal
 */
export function getProjectRoles(client: SanityClient, projectId: string): Promise<ProjectRole[]> {
  return client.request<ProjectRole[]>({uri: `/projects/${projectId}/roles`})
}
