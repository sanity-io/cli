import {type SanityClient} from '@sanity/client'

import {getPendingInvitations} from './getPendingInvitations.js'
import {type Invite, type PartialProjectResponse, type User} from './types.js'
import {usersDebug} from './usersDebug.js'

interface GetMembersForProjectOptions {
  client: SanityClient
  projectId: string

  /**
   * Whether to include pending invitations in the response
   */
  invitations?: boolean

  /**
   * Whether to include robots in the response
   */
  robots?: boolean
}

function getUserProps(user: User | undefined) {
  const {createdAt: date, displayName: name} = user || {}
  return {date: date || '', name: name || ''}
}

interface MemberList {
  date: string
  id: string
  name: string
  role: string
}

/**
 * Get all members for a project
 *
 * @returns A list of all members for a project
 */
export async function getMembersForProject({
  client,
  invitations,
  projectId,
  robots,
}: GetMembersForProjectOptions): Promise<MemberList[]> {
  try {
    const useGlobalApi = true
    const [pendingInvitations, project] = await Promise.all([
      invitations
        ? client
            .request<Invite[]>({uri: `/invitations/project/${projectId}`, useGlobalApi})
            .then(getPendingInvitations)
        : [],
      client.request<PartialProjectResponse>({
        query: {
          includeFeatures: 'false',
        },
        uri: `/projects/${projectId}`,
        useGlobalApi,
      }),
    ])

    const memberIds = project.members
      // Filter all the robot users if the robots flag is not set
      .filter((member) => !member.isRobot || robots)
      .map((member) => member.id)

    const users = await client
      .request<User | User[]>({uri: `/users/${memberIds.join(',')}`, useGlobalApi})
      .then((user) => (Array.isArray(user) ? user : [user]))

    const projectMembers = project.members
      .map((member) => {
        return {
          ...member,
          ...getUserProps(users.find((candidate) => candidate.id === member.id)),
        }
      })
      .filter((member) => !member.isRobot || robots)

    const members = [...projectMembers, ...pendingInvitations]

    usersDebug(`Found ${projectMembers.length} project members for ${projectId}`)
    usersDebug(`Found ${pendingInvitations.length} pending invitations for ${projectId}`)
    return members
  } catch (error) {
    usersDebug(`Error fetching members for ${projectId}:`, error)
    throw new Error(`Error fetching members for ${projectId}`, {cause: error})
  }
}
