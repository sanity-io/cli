import {getGlobalCliClient} from '@sanity/cli-core'
import {
  AUTH_API_VERSION,
  exchangeLoginSession,
  getLoginProviders,
  getSamlLoginProviders,
} from '@sanity/cli-setup/auth'

import {type SamlLoginProvider} from '../actions/auth/types.js'

export {AUTH_API_VERSION} from '@sanity/cli-setup/auth'

async function getUnauthenticatedClient() {
  return getGlobalCliClient({apiVersion: AUTH_API_VERSION, unauthenticated: true})
}

/**
 * Invalidate the current user session
 *
 * @param token - Optional token to invalidate.
 */
export async function logout(token?: string) {
  let client = await getGlobalCliClient({apiVersion: AUTH_API_VERSION})

  if (token) {
    client = client.withConfig({token})
  }

  return client.request({method: 'POST', url: '/auth/logout'})
}

export async function getProviders() {
  const client = await getUnauthenticatedClient()

  return getLoginProviders(client)
}

export async function getVercelProviderUrl() {
  const client = (await getUnauthenticatedClient()).withConfig({apiVersion: 'v1'})
  return client.getUrl('/auth/login/vercel')
}

export async function getSSOProviders(orgSlug: string) {
  const client = await getUnauthenticatedClient()

  return getSamlLoginProviders(client, orgSlug)
}

export async function getTokenDetails(queryString: string) {
  const client = await getUnauthenticatedClient()

  return exchangeLoginSession(client, queryString)
}

/**
 * List the SSO providers configured for an organization. Members without
 * organization read access only see enabled providers.
 *
 * @param organizationId - The ID of the organization
 */
export async function getOrganizationSSOProviders(organizationId: string) {
  const client = await getGlobalCliClient({apiVersion: AUTH_API_VERSION, requireUser: true})

  return client.request<SamlLoginProvider[]>({
    url: `/auth/organizations/${organizationId}/providers`,
  })
}
