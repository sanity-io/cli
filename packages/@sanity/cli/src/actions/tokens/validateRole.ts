import {ux} from '@oclif/core'
import {type SanityClient} from '@sanity/client'

import {getProjectRoles} from '../../services/getProjectRoles.js'

/**
 * Validate a role name
 * @param roleName - The role name to validate
 * @param client - The Sanity client
 * @param projectId - The project ID
 * @returns A promise that resolves to the validated role name
 *
 * @internal
 */
export async function validateRole(
  roleName: string,
  client: SanityClient,
  projectId: string,
): Promise<string> {
  const roles = await getProjectRoles(client, projectId)
  const robotRoles = roles.filter((role) => role.appliesToRobots)

  const role = robotRoles.find((r) => r.name === roleName)
  if (role) {
    return roleName
  }

  const availableRoles = robotRoles.map((r) => r.name).join(', ')
  ux.error(`Invalid role "${roleName}". Available roles: ${availableRoles}`, {exit: 1})
}
