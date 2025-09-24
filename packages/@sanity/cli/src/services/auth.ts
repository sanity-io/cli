import {getGlobalCliClient} from '@sanity/cli-core'

export const AUTH_API_VERSION = '2025-09-23'

export async function logout() {
  const client = await getGlobalCliClient({apiVersion: AUTH_API_VERSION})

  return client.request({method: 'POST', uri: '/auth/logout'})
}
