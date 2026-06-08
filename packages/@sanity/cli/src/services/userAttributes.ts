import {getGlobalCliClient} from '@sanity/cli-core'

/**
 * API version for the user attributes endpoints.
 * This is a preview/experimental API version.
 */
export const USER_ATTRIBUTES_API_VERSION = 'vX'

export type AttributeType =
  | 'boolean'
  | 'integer'
  | 'integer-array'
  | 'number'
  | 'number-array'
  | 'string'
  | 'string-array'

type AttributeSource = 'saml' | 'sanity'

interface AttributeDefinition {
  createdAt: string
  key: string
  sources: AttributeSource[]
  type: AttributeType

  alreadyExists?: boolean
}

interface AttributeDefinitionListResponse {
  definitions: AttributeDefinition[]
  hasMore: boolean

  nextCursor?: string | null
}

export type AttributeValue = (number | string)[] | boolean | number | string

/**
 * Raw per-source values for a single attribute. Each entry holds the value
 * received from that source (e.g. asserted in a SAML assertion, or set
 * explicitly through Sanity). Both may be present at once; the value the API
 * and access rules use is `UserAttribute.activeValue`, picked according to
 * `UserAttribute.activeSource`.
 */
interface UserAttributeValues {
  saml?: AttributeValue
  sanity?: AttributeValue
}

interface UserAttribute {
  activeSource: AttributeSource
  activeValue: AttributeValue
  key: string
  type: AttributeType
  values: UserAttributeValues
}

interface UserAttributesGetResponse {
  attributes: UserAttribute[]
  organizationId: string
  sanityUserId: string
}

interface UserAttributesResponse extends UserAttributesGetResponse {
  updatedAt: string
}

export interface SetAttributeInput {
  key: string
  value: AttributeValue
}

async function getClient() {
  return getGlobalCliClient({
    apiVersion: USER_ATTRIBUTES_API_VERSION,
    requireUser: true,
  })
}

/**
 * List attribute definitions for an organization
 */
export async function listAttributeDefinitions(
  orgId: string,
): Promise<AttributeDefinitionListResponse> {
  const client = await getClient()
  return client.request<AttributeDefinitionListResponse>({
    uri: `/organizations/${orgId}/attribute-definitions`,
  })
}

/**
 * Create an attribute definition for an organization
 */
export async function createAttributeDefinition(
  orgId: string,
  key: string,
  type: AttributeType,
): Promise<AttributeDefinition> {
  const client = await getClient()
  return client.request<AttributeDefinition>({
    body: {key, type},
    method: 'POST',
    uri: `/organizations/${orgId}/attribute-definitions`,
  })
}

/**
 * Delete an attribute definition for an organization
 */
export async function deleteAttributeDefinition(orgId: string, key: string): Promise<void> {
  const client = await getClient()
  return client.request({
    method: 'DELETE',
    uri: `/organizations/${orgId}/attribute-definitions/${encodeURIComponent(key)}`,
  })
}

/**
 * Get the authenticated user's own attributes within an organization
 */
export async function getCliUserAttributes(orgId: string): Promise<UserAttributesGetResponse> {
  const client = await getClient()
  return client.request<UserAttributesGetResponse>({
    uri: `/organizations/${orgId}/users/me/attributes`,
  })
}

/**
 * Get a specific user's attributes within an organization
 */
export async function getUserAttributes(
  orgId: string,
  userId: string,
): Promise<UserAttributesGetResponse> {
  const client = await getClient()
  return client.request<UserAttributesGetResponse>({
    uri: `/organizations/${orgId}/users/${encodeURIComponent(userId)}/attributes`,
  })
}

/**
 * Set attribute values for a user within an organization
 */
export async function updateUserAttributes(
  orgId: string,
  userId: string,
  attributes: SetAttributeInput[],
): Promise<UserAttributesResponse> {
  const client = await getClient()
  return client.request<UserAttributesResponse>({
    body: {attributes},
    method: 'POST',
    uri: `/organizations/${orgId}/users/${encodeURIComponent(userId)}/attributes`,
  })
}

/**
 * Delete attribute values for a user within an organization
 */
export async function deleteUserAttributes(
  orgId: string,
  userId: string,
  keys: string[],
): Promise<UserAttributesResponse> {
  const client = await getClient()
  return client.request<UserAttributesResponse>({
    body: {attributes: keys.map((key) => ({key}))},
    method: 'DELETE',
    uri: `/organizations/${orgId}/users/${encodeURIComponent(userId)}/attributes`,
  })
}
