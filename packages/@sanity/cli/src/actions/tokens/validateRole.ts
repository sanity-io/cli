import {ux} from '@oclif/core'

import {getTokenRoles} from '../../services/tokens.js'

/**
 * Validate a role name
 * @param roleName - The role name to validate
 * @param projectId - The project ID
 * @returns A promise that resolves to the validated role name
 *
 * @internal
 */
export async function validateRole(roleName: string, projectId: string): Promise<string> {
  const roles = await getTokenRoles(projectId)
  const robotRoles = roles.filter((role) => role.appliesToRobots)

  const role = robotRoles.find((r) => r.name === roleName)
  if (role) {
    return roleName
  }

  const availableRoles = robotRoles.map((r) => r.name).join(', ')
  ux.error(`Invalid role "${roleName}". Available roles: ${availableRoles}`, {exit: 1})
}
