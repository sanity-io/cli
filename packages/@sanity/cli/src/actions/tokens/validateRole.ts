import {exitCodes, type Output} from '@sanity/cli-core'

import {getTokenRoles} from '../../services/tokens.js'
import {type SelectedTokenRole} from './types.js'

/**
 * Validate a role name
 * @param roleName - The role name to validate
 * @param projectId - The project ID
 * @param output - Output to raise the error through the calling command
 * @returns A promise that resolves to the validated role
 *
 * @internal
 */
export async function validateRole(
  roleName: string,
  projectId: string,
  output: Output,
): Promise<SelectedTokenRole> {
  const roles = await getTokenRoles(projectId)
  const robotRoles = roles.filter((role) => role.appliesToRobots)

  const role = robotRoles.find((r) => r.name === roleName)
  if (role) {
    return {name: role.name, title: role.title}
  }

  const availableRoles = robotRoles.map((r) => r.name).join(', ')
  return output.error(`Invalid role "${roleName}". Available roles: ${availableRoles}`, {
    exit: exitCodes.USAGE_ERROR,
  })
}
