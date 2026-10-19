import {getProjectMembership} from '../../services/tokens.js'
import {ORG_ROLE_LABELS} from './grants.js'
import {type Robot, type TokenScope} from './types.js'

export function formatTokenAccess(token: Robot, scope: TokenScope): string {
  if (scope.resourceType === 'project') {
    return getProjectMembership(token, scope.resourceId)?.roleNames.join(', ') || 'No roles'
  }

  const access = token.memberships.flatMap(({resourceId, resourceType, roleNames}) => {
    if (resourceType !== 'organization') {
      return [`${resourceType}:${resourceId}: ${roleNames.join(', ') || 'No roles'}`]
    }

    return roleNames.map(
      (name) => ORG_ROLE_LABELS.get(name) ?? `${resourceType}:${resourceId}: ${name}`,
    )
  })

  return access.join('; ') || 'No roles'
}
