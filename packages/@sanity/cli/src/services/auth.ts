import {getGlobalCliClient} from '@sanity/cli-core'

import {
  type ProvidersResponse,
  type SamlLoginProvider,
  type TokenDetails,
} from '../actions/auth/types.js'

export const AUTH_API_VERSION = 'v2025-09-23'

async function getUnauthenticatedClient() {
  return (await getGlobalCliClient({apiVersion: AUTH_API_VERSION})).withConfig({token: undefined})
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

  return client.request({method: 'POST', uri: '/auth/logout'})
}

export async function getProviders() {
  const client = await getUnauthenticatedClient()

  return client.request<ProvidersResponse>({uri: '/auth/providers'})
}

export async function getSSOProviders(orgSlug: string) {
  const client = await getUnauthenticatedClient()

  return client.request<SamlLoginProvider[]>({
    uri: `/auth/organizations/by-slug/${orgSlug}/providers`,
  })
}

export async function getTokenDetails(queryString: string) {
  const client = await getUnauthenticatedClient()

  return client.request<TokenDetails>({uri: `/auth/fetch${queryString}`})
}
