import {type SanityOrgUser} from '@sanity/cli-core'

import {type ProjectOrganization} from '../../services/organizations.js'

export function findOrganizationByUserName(
  organizations: ProjectOrganization[],
  user: SanityOrgUser,
): string | undefined {
  return organizations.find((org) => org.name === user?.name)?.id
}
