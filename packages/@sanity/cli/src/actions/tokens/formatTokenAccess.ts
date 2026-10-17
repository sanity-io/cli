import {ORG_PERMISSIONS} from './grants.js'
import {type Robot} from './types.js'

export function formatTokenAccess(token: Robot): string {
  const access = token.memberships.flatMap(({resourceId, resourceType, roleNames}) => {
    if (resourceType !== 'organization') {
      return [`${resourceType}:${resourceId}: ${roleNames.join(', ') || 'No roles'}`]
    }

    return roleNames.map((name) => {
      for (const permission of ORG_PERMISSIONS) {
        if ('roleName' in permission) {
          if (permission.roleName === name) return permission.title
          continue
        }
        const role = permission.roles.find((candidate) => candidate.roleName === name)
        if (role) return `${permission.title}: ${role.title}`
      }
      return `${resourceType}:${resourceId}: ${name}`
    })
  })

  return access.join('; ') || 'No roles'
}
