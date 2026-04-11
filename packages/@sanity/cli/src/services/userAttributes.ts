import {getGlobalCliClient} from '@sanity/cli-core'

import {USER_ATTRIBUTES_API_VERSION} from '../actions/userAttributes/constants.js'
import {
  type AttributeDefinition,
  type AttributeDefinitionListResponse,
  type AttributeType,
  type SetAttributeInput,
  type UserAttributesGetResponse,
  type UserAttributesResponse,
} from '../actions/userAttributes/types.js'

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
export async function getMyAttributes(orgId: string): Promise<UserAttributesGetResponse> {
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
