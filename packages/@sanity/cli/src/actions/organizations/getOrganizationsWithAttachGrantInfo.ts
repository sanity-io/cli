import {type OrganizationWithGrant, type ProjectOrganization} from '../../services/organizations.js'
import {hasProjectAttachGrant} from './hasProjectAttachGrant.js'

export async function getOrganizationsWithAttachGrantInfo(
  organizations: ProjectOrganization[],
): Promise<OrganizationWithGrant[]> {
  const results = await Promise.all(
    organizations.map(async (organization) => ({
      hasAttachGrant: await hasProjectAttachGrant(organization.id),
      organization,
    })),
  )
  return results
}
