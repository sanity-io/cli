import {getGlobalCliClient} from '@sanity/cli-core'

export const ORGANIZATIONS_API_VERSION = 'v2025-05-14'

export interface ProjectOrganization {
  id: string
  name: string
  slug: string
}

export interface OrganizationCreateResponse {
  createdByUserId: string
  defaultRoleName: string | null
  features: unknown[]
  id: string
  members: unknown[]
  name: string
  slug: string | null
}

export interface OrganizationWithGrant {
  hasAttachGrant: boolean
  organization: ProjectOrganization
}

interface OrganizationGrant {
  grants: {name: string}[]
}

interface OrganizationGrantsResponse {
  [key: string]: OrganizationGrant[]
}

/**
 * List all organizations the user has access to
 */
export async function listOrganizations(): Promise<ProjectOrganization[]> {
  const client = await getGlobalCliClient({
    apiVersion: ORGANIZATIONS_API_VERSION,
    requireUser: true,
  })

  return client.request<ProjectOrganization[]>({
    uri: '/organizations',
  })
}

/**
 * Create a new organization
 */
export async function createOrganization(name: string): Promise<OrganizationCreateResponse> {
  const client = await getGlobalCliClient({
    apiVersion: ORGANIZATIONS_API_VERSION,
    requireUser: true,
  })

  return client.request<OrganizationCreateResponse>({
    body: {name},
    method: 'post',
    uri: '/organizations',
  })
}

/**
 * Get organization grants for a specific organization
 */
export async function getOrganizationGrants(
  organizationId: string,
): Promise<OrganizationGrantsResponse> {
  const client = await getGlobalCliClient({
    apiVersion: ORGANIZATIONS_API_VERSION,
    requireUser: true,
  })

  return client.request<OrganizationGrantsResponse>({
    uri: `organizations/${organizationId}/grants`,
  })
}
