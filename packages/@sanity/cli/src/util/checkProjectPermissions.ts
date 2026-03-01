import {type RequiredPermission, type UserGrantsResponse} from '../types/grants.js'

/**
 * Returns the set of project IDs that have ALL of the required permissions.
 *
 * Iterates through `grants.projects` and checks that each project has every
 * required `{permission, grant}` combination present in its grant resources.
 */
export function getProjectsWithPermissions(
  grants: UserGrantsResponse,
  requiredPermissions: RequiredPermission[],
): Set<string> {
  const permitted = new Set<string>()

  for (const [projectId, permissionMap] of Object.entries(grants.projects)) {
    const hasAll = requiredPermissions.every(({grant, permission}) => {
      const resources = permissionMap[permission]
      if (!resources) return false
      return resources.some((resource) => resource.grants.some((g) => g.name === grant))
    })

    if (hasAll) {
      permitted.add(projectId)
    }
  }

  return permitted
}
