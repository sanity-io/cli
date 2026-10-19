import {getGlobalCliClient} from '@sanity/cli-core'
import {type SanityClient} from '@sanity/client'

import {TOKENS_API_VERSION} from '../actions/tokens/constants.js'
import {
  type Membership,
  type Robot,
  type RobotWithToken,
  type Role,
  type TokenScope,
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

async function fetchAllPages<T>(
  client: SanityClient,
  url: string,
  query: Record<string, string> = {},
): Promise<T[]> {
  const items: T[] = []
  let cursor: string | null = null

  do {
    const response: PaginatedResponse<T> = await client.request<PaginatedResponse<T>>({
      query: {...query, ...(cursor === null ? {} : {nextCursor: cursor})},
      url,
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

interface RobotBody {
  label: string
  memberships: Membership[]

  expiresAt?: string
}

async function postRobot(
  url: string,
  {expiresAt, ...body}: RobotBody,
  query: Record<string, string> = {},
): Promise<RobotWithToken> {
  const client = await getClient()

  return client.request<RobotWithToken>({
    body: {...body, ...(expiresAt === undefined ? {} : {expiresAt})},
    method: 'POST',
    query,
    url,
  })
}

interface CreateTokenOptions {
  label: string
  projectId: string
  roleNames: string[]

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
  const {expiresAt, label, projectId, roleNames, sendNotification} = options

  return postRobot(
    `/access/project/${projectId}/robots`,
    {
      expiresAt,
      label,
      memberships: [{resourceId: projectId, resourceType: 'project', roleNames}],
    },
    sendNotification === false ? {sendNotification: 'false'} : {},
  )
}

interface CreateOrganizationTokenOptions extends RobotBody {
  organizationId: string
}

/**
 * Create an organization token, which can hold organization permissions and roles on several projects
 * @param options - The options for the organization token
 * @returns A promise that resolves to the created robot, including its secret token
 *
 * @internal
 */
export async function createOrganizationToken(
  options: CreateOrganizationTokenOptions,
): Promise<RobotWithToken> {
  const {organizationId, ...body} = options

  return postRobot(`/access/organization/${organizationId}/robots`, body)
}

function robotsUrl({resourceId, resourceType}: TokenScope): string {
  return `/access/${resourceType}/${resourceId}/robots`
}

function isManagedByOrganization(robot: Robot, organizationId: string): boolean {
  return (
    robot.managedBy?.resourceType === 'organization' &&
    robot.managedBy.resourceId === organizationId
  )
}

/** Delete a token from the requested scope. @internal */
export async function deleteToken(scope: TokenScope, tokenId: string): Promise<void> {
  const client = await getClient()
  const url = `${robotsUrl(scope)}/${tokenId}`

  if (scope.resourceType === 'organization') {
    const robot = await client.request<Robot>({url})
    if (!isManagedByOrganization(robot, scope.resourceId)) {
      throw new Error(
        `Token "${tokenId}" is not managed by organization "${scope.resourceId}". Use tokens list --organization ${scope.resourceId} to find tokens managed by this organization.`,
      )
    }
  }

  return client.request({method: 'DELETE', url})
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
    url: '/access/robots/me/rotate',
  })
}

/** List tokens managed at the requested scope. @internal */
export async function getTokens(scope: TokenScope): Promise<Robot[]> {
  const client = await getClient()
  const query: Record<string, string> =
    scope.resourceType === 'organization' ? {includeChildren: 'true', limit: '500'} : {}
  const robots = await fetchAllPages<Robot>(client, robotsUrl(scope), query)

  if (scope.resourceType === 'organization') {
    return robots.filter((robot) => isManagedByOrganization(robot, scope.resourceId))
  }

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
