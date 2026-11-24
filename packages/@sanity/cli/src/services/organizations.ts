import {getGlobalCliClient} from '@sanity/cli-core'
import {type ImageFile} from '@sanity/cli-core/images'
import {RawRequestOptions} from '@sanity/client'

export const ORGANIZATIONS_API_VERSION = 'v2025-05-14'

// The logo routes are only on vX while they are experimental.
const ORGANIZATION_LOGO_API_VERSION = 'vX'

export interface ProjectOrganization {
  id: string
  name: string
  slug: string | null
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

interface Organization extends ProjectOrganization {
  createdAt: string
  defaultRoleName: string | null
  updatedAt: string
}

export interface OrganizationUpdateParams {
  defaultRoleName?: string
  name?: string
  slug?: string
}

interface OrganizationLogoResponse {
  logoUrl: string | null
}

interface OrganizationDeleteResponse {
  deleted: boolean
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

type OrganizationRequestQuery = RawRequestOptions['query']

/**
 * List all organizations the user has access to
 */
export async function listOrganizations(
  query?: OrganizationRequestQuery,
): Promise<ProjectOrganization[]> {
  const client = await getGlobalCliClient({
    apiVersion: ORGANIZATIONS_API_VERSION,
    requireUser: true,
  })

  return client.request<ProjectOrganization[]>({
    query,
    url: '/organizations',
  })
}

/**
 * Create a new organization
 */
export async function createOrganization(
  name: string,
  defaultRoleName?: string,
): Promise<OrganizationCreateResponse> {
  const client = await getGlobalCliClient({
    apiVersion: ORGANIZATIONS_API_VERSION,
    requireUser: true,
  })

  return client.request<OrganizationCreateResponse>({
    body: {name, ...(defaultRoleName ? {defaultRoleName} : {})},
    method: 'post',
    url: '/organizations',
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
    url: `/organizations/${organizationId}/grants`,
  })
}

/**
 * Get a single organization by ID
 */
export async function getOrganization(organizationId: string): Promise<Organization> {
  const client = await getGlobalCliClient({
    apiVersion: ORGANIZATIONS_API_VERSION,
    requireUser: true,
  })

  return client.request<Organization>({
    query: {includeFeatures: 'false', includeMembers: 'false'},
    url: `/organizations/${organizationId}`,
  })
}

/**
 * Update an organization
 */
export async function updateOrganization(
  organizationId: string,
  params: OrganizationUpdateParams,
): Promise<Organization> {
  const client = await getGlobalCliClient({
    apiVersion: ORGANIZATIONS_API_VERSION,
    requireUser: true,
  })

  return client.request<Organization>({
    body: params,
    method: 'patch',
    url: `/organizations/${organizationId}`,
  })
}

/**
 * Set an organization's logo, replacing any previous logo
 */
export async function setOrganizationLogo(
  organizationId: string,
  logo: ImageFile,
): Promise<OrganizationLogoResponse> {
  const client = await getGlobalCliClient({
    apiVersion: ORGANIZATION_LOGO_API_VERSION,
    requireUser: true,
  })

  return client.request<OrganizationLogoResponse>({
    body: logo.image,
    headers: {'Content-Type': logo.contentType},
    method: 'put',
    url: `/organizations/${organizationId}/logo`,
  })
}

/**
 * Remove an organization's logo
 */
export async function removeOrganizationLogo(
  organizationId: string,
): Promise<OrganizationLogoResponse> {
  const client = await getGlobalCliClient({
    apiVersion: ORGANIZATION_LOGO_API_VERSION,
    requireUser: true,
  })

  return client.request<OrganizationLogoResponse>({
    method: 'delete',
    url: `/organizations/${organizationId}/logo`,
  })
}

/**
 * Delete an organization
 */
export async function deleteOrganization(
  organizationId: string,
): Promise<OrganizationDeleteResponse> {
  const client = await getGlobalCliClient({
    apiVersion: ORGANIZATIONS_API_VERSION,
    requireUser: true,
  })

  return client.request<OrganizationDeleteResponse>({
    method: 'delete',
    url: `/organizations/${organizationId}`,
  })
}
