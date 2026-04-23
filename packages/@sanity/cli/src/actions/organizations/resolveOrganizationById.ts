import {type ProjectOrganization} from '../../services/organizations.js'

export function resolveOrganizationById(
  organizations: ProjectOrganization[],
  idOrSlug: string,
): ProjectOrganization {
  const org = organizations.find((o) => o.id === idOrSlug || o.slug === idOrSlug)
  if (org) return org

  throw new Error(`Organization "${idOrSlug}" not found or you don't have access to it`)
}
