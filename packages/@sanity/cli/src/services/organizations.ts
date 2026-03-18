import {getGlobalCliClient} from '@sanity/cli-core'
import {RawRequestOptions} from '@sanity/client'

export const ORGANIZATIONS_API_VERSION = 'v2025-05-14'

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

export interface Organization extends ProjectOrganization {
  createdAt: string
  defaultRoleName: string | null
  updatedAt: string
}

export interface OrganizationUpdateParams {
  defaultRoleName?: string
  name?: string
  slug?: string
}

export interface OrganizationDeleteResponse {
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
    uri: '/organizations',
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
    uri: `/organizations/${organizationId}/grants`,
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
    uri: `/organizations/${organizationId}`,
    query: {includeMembers: 'false', includeFeatures: 'false'},
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
    uri: `/organizations/${organizationId}`,
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
    uri: `/organizations/${organizationId}`,
  })
}
