import {getGlobalCliClient} from '@sanity/cli-core'
import {ClientError, type SanityClient} from '@sanity/client'

import {TOKENS_API_VERSION} from '../actions/tokens/constants.js'
import {
  type ProjectRole,
  type Robot,
  type Token,
  type TokenResponse,
} from '../actions/tokens/types.js'

interface AccessApiPage<T> {
  data: T[]
  nextCursor: string | null
}

async function getClient(): Promise<SanityClient> {
  return getGlobalCliClient({
    apiVersion: TOKENS_API_VERSION,
    requireUser: true,
  })
}

async function fetchAllPages<T>(
  client: SanityClient,
  uri: string,
  query: Record<string, string> = {},
): Promise<T[]> {
  const results: T[] = []
  let cursor: string | undefined

  do {
    const page = await client.request<AccessApiPage<T>>({
      query: {...query, ...(cursor ? {nextCursor: cursor} : {})},
      uri,
    })
    results.push(...(page.data ?? []))
    cursor = page.nextCursor ?? undefined
  } while (cursor)

  return results
}

function getProjectRoleNames(robot: Robot, projectId: string): string[] {
  return (robot.memberships ?? [])
    .filter(
      (membership) => membership.resourceType === 'project' && membership.resourceId === projectId,
    )
    .flatMap((membership) => membership.roleNames ?? [])
}

function robotToToken(robot: Robot, projectId: string, roleTitles: Map<string, string>): Token {
  return {
    createdAt: robot.createdAt,
    expiresAt: robot.expiresAt ?? null,
    id: robot.id,
    label: robot.label,
    roles: getProjectRoleNames(robot, projectId).map((name) => ({
      name,
      title: roleTitles.get(name) ?? name,
    })),
    tokenId: robot.tokenId,
  }
}

function getRobots(client: SanityClient, projectId: string): Promise<Robot[]> {
  return fetchAllPages<Robot>(client, `/access/project/${projectId}/robots`, {
    includeChildren: 'false',
  })
}

/**
 * Robots can hold a membership on a project while being managed elsewhere
 * (eg by an organization). Only robots managed by the project itself are
 * project API tokens.
 */
function isManagedByProject(robot: Robot, projectId: string): boolean {
  return robot.managedBy?.resourceType === 'project' && robot.managedBy.resourceId === projectId
}

interface CreateTokenOptions {
  label: string
  projectId: string
  roleName: string

  expiresAt?: string
  roleTitle?: string
}

/**
 * Add a token to a project
 * @param options - The options for adding a token to a project
 * @returns A promise that resolves to the token response
 *
 * @internal
 */
export async function createToken(options: CreateTokenOptions): Promise<TokenResponse> {
  const {expiresAt, label, projectId, roleName, roleTitle} = options

  const client = await getClient()

  const robot = await client.request<Robot & {token: string}>({
    body: {
      label,
      memberships: [{resourceId: projectId, resourceType: 'project', roleNames: [roleName]}],
      ...(expiresAt ? {expiresAt} : {}),
    },
    method: 'POST',
    uri: `/access/project/${projectId}/robots`,
  })

  return {
    ...robotToToken(robot, projectId, new Map(roleTitle ? [[roleName, roleTitle]] : [])),
    key: robot.token,
  }
}

interface DeleteTokenOptions {
  projectId: string
  tokenId: string
}

/**
 * Delete a token from a project. Accepts either the robot ID (as shown by
 * `tokens list`) or the legacy token ID previously exposed by the Projects
 * API, which maps to the robot's `tokenId`.
 *
 * @param options - The options for deleting a token from a project
 * @returns A promise that resolves when the token is deleted
 *
 * @internal
 */
export async function deleteToken(options: DeleteTokenOptions): Promise<void> {
  const {projectId, tokenId} = options

  const client = await getClient()

  const deleteRobot = (robotId: string) =>
    client.request<void>({
      method: 'DELETE',
      uri: `/access/project/${projectId}/robots/${robotId}`,
    })

  try {
    return await deleteRobot(tokenId)
  } catch (error) {
    if (!(error instanceof ClientError && error.response.statusCode === 404)) {
      throw error
    }

    // The given ID may be a legacy token ID (as exposed by the deprecated
    // Projects API), which maps to a robot's `tokenId` rather than its `id`
    let robots: Robot[]
    try {
      robots = await getRobots(client, projectId)
    } catch {
      throw error
    }

    const match = robots.find((robot) => robot.tokenId === tokenId)
    if (!match) {
      throw error
    }

    return await deleteRobot(match.id)
  }
}

/**
 * Get all tokens for a project
 * @param projectId - The project ID
 * @returns A promise that resolves to an array of tokens
 *
 * @internal
 */
export async function getTokens(projectId: string): Promise<Token[]> {
  const client = await getClient()

  const robots = await getRobots(client, projectId)
  const projectRobots = robots.filter((robot) => isManagedByProject(robot, projectId))
  if (projectRobots.length === 0) {
    return []
  }

  // Robot memberships only carry role names; fetch the project roles to
  // resolve display titles, falling back to the names if that fails
  let roleTitles = new Map<string, string>()
  try {
    const roles = await fetchProjectRoles(client, projectId)
    roleTitles = new Map(roles.map((role) => [role.name, role.title]))
  } catch {
    // Listing tokens should not require permission to read roles
  }

  return projectRobots.map((robot) => robotToToken(robot, projectId, roleTitles))
}

function fetchProjectRoles(client: SanityClient, projectId: string): Promise<ProjectRole[]> {
  return fetchAllPages<ProjectRole>(client, `/access/project/${projectId}/roles`, {
    includeChildren: 'false',
    limit: '500',
  })
}

/**
 * Get all roles for a project
 * @param projectId - The project ID
 * @returns A promise that resolves to an array of project roles
 *
 * @internal
 */
export async function getTokenRoles(projectId: string): Promise<ProjectRole[]> {
  const client = await getClient()

  return fetchProjectRoles(client, projectId)
}
