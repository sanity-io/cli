import {getGlobalCliClient, getProjectCliClient, type SanityOrgUser} from '@sanity/cli-core'

import {type User} from '../actions/users/types.js'

/**
 * The API version to use for the users list command
 *
 * @internal
 */
export const USERS_API_VERSION = 'v2025-08-30'

export async function getCliUser() {
  const client = await getGlobalCliClient({
    apiVersion: USERS_API_VERSION,
    requireUser: true,
  })

  return client.users.getById('me') as unknown as SanityOrgUser
}

export async function getMembers(memberIds: string[]) {
  const client = await getGlobalCliClient({
    apiVersion: USERS_API_VERSION,
    requireUser: true,
  })

  return client.request<User | User[]>({uri: `/users/${memberIds.join(',')}`})
}

/**
 * Get the user for a project
 * @param projectId - The ID of the project
 */
export async function getProjectUser(projectId: string) {
  const client = await getProjectCliClient({
    apiVersion: USERS_API_VERSION,
    projectId,
    requireUser: true,
  })

  return client.users.getById('me')
}
