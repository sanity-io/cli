import {getGlobalCliClient} from '@sanity/cli-core'
import {type SanityClient} from '@sanity/client'

import {TOKENS_API_VERSION} from '../actions/tokens/constants.js'
import {
  type Membership,
  type Robot,
  type RobotWithToken,
  type Role,
} from '../actions/tokens/types.js'

interface PaginatedResponse<T> {
  data: T[]
  nextCursor: string | null
}

function getClient(token?: string): Promise<SanityClient> {
  return getGlobalCliClient({
    apiVersion: TOKENS_API_VERSION,
    requireUser: true,
    ...(token === undefined ? {} : {token}),
  })
}

async function fetchAllPages<T>(client: SanityClient, uri: string): Promise<T[]> {
  const items: T[] = []
  let cursor: string | null = null

  do {
    const response: PaginatedResponse<T> = await client.request<PaginatedResponse<T>>({
      query: cursor === null ? {} : {nextCursor: cursor},
      uri,
    })
    items.push(...response.data)
    cursor = response.nextCursor
  } while (cursor !== null)

  return items
}

/**
 * Get the membership granting a robot access to the given project
 * @param robot - The robot to inspect
 * @param projectId - The project ID
 * @returns The project membership, if any
 *
 * @internal
 */
export function getProjectMembership(robot: Robot, projectId: string): Membership | undefined {
  return robot.memberships.find(
    (membership) => membership.resourceType === 'project' && membership.resourceId === projectId,
  )
}

interface CreateTokenOptions {
  label: string
  projectId: string
  roleName: string

  expiresAt?: string
  sendNotification?: boolean
}

/**
 * Add a token to a project
 * @param options - The options for adding a token to a project
 * @returns A promise that resolves to the created robot, including its secret token
 *
 * @internal
 */
export async function createToken(options: CreateTokenOptions): Promise<RobotWithToken> {
  const {expiresAt, label, projectId, roleName, sendNotification} = options

  const client = await getClient()

  return client.request<RobotWithToken>({
    body: {
      label,
      memberships: [{resourceId: projectId, resourceType: 'project', roleNames: [roleName]}],
      ...(expiresAt === undefined ? {} : {expiresAt}),
    },
    method: 'POST',
    query: sendNotification === false ? {sendNotification: 'false'} : {},
    uri: `/access/project/${projectId}/robots`,
  })
}

interface DeleteTokenOptions {
  projectId: string
  tokenId: string
}

/**
 * Delete a token from a project
 * @param options - The options for deleting a token from a project; `tokenId`
 * is the id reported by `getTokens`/`createToken`
 * @returns A promise that resolves when the token is deleted
 *
 * @internal
 */
export async function deleteToken(options: DeleteTokenOptions): Promise<void> {
  const {projectId, tokenId} = options

  const client = await getClient()

  return client.request({
    method: 'DELETE',
    uri: `/access/project/${projectId}/robots/${tokenId}`,
  })
}

/**
 * Rotate a robot token, replacing its secret while preserving the robot,
 * its roles, and the token's expiry. The request authenticates as the robot
 * itself; the previous secret is revoked immediately.
 * @param token - The current robot token secret
 * @returns A promise that resolves to the robot with its new secret token
 *
 * @internal
 */
export async function rotateToken(token: string): Promise<RobotWithToken> {
  const client = await getClient(token)

  return client.request<RobotWithToken>({
    method: 'POST',
    uri: '/access/robots/me/rotate',
  })
}

/**
 * Get all tokens for a project. Tokens managed by an organization are
 * excluded: they cannot be managed at the project scope.
 * @param projectId - The project ID
 * @returns A promise that resolves to an array of robots
 *
 * @internal
 */
export async function getTokens(projectId: string): Promise<Robot[]> {
  const client = await getClient()

  const robots = await fetchAllPages<Robot>(client, `/access/project/${projectId}/robots`)

  return robots.filter((robot) => robot.managedBy?.resourceType !== 'organization')
}

/**
 * Get all roles for a project
 * @param projectId - The project ID
 * @returns A promise that resolves to an array of project roles
 *
 * @internal
 */
export async function getTokenRoles(projectId: string): Promise<Role[]> {
  const client = await getClient()

  return fetchAllPages<Role>(client, `/access/project/${projectId}/roles`)
}
