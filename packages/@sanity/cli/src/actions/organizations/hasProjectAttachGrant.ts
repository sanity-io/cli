import {subdebug} from '@sanity/cli-core'

import {getOrganizationGrants} from '../../services/organizations.js'

const debug = subdebug('organizations')

export async function hasProjectAttachGrant(orgId: string) {
  const requiredGrantGroup = 'sanity.organization.projects'
  const requiredGrant = 'attach'

  try {
    const grants = await getOrganizationGrants(orgId)
    const group: {grants: {name: string}[]}[] = grants[requiredGrantGroup] || []
    return group.some(
      (resource) =>
        resource.grants && resource.grants.some((grant) => grant.name === requiredGrant),
    )
  } catch (err) {
    // If we get a 401, it means we don't have access to this organization
    // probably because of implicit membership
    if ('statusCode' in err && err.statusCode === 401) {
      debug('No access to organization %s (401)', orgId)
      return false
    }
    // For other errors, log them but still return false
    debug('Error checking grants for organization %s: %s', orgId, err.message)
    return false
  }
}
