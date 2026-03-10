import {type SanityOrgUser} from '@sanity/cli-core'

import {type OrganizationWithGrant, type ProjectOrganization} from '../../services/organizations.js'

export function getDefaultOrganizationId(
  withAttach: OrganizationWithGrant[],
  organizations: ProjectOrganization[],
  user: SanityOrgUser,
): string | undefined {
  return withAttach.length === 1
    ? withAttach[0].organization.id
    : organizations.find((org) => org.name === user?.name)?.id
}
