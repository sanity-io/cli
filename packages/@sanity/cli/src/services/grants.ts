import {getGlobalCliClient} from '@sanity/cli-core'

import {type UserGrantsResponse} from '../types/grants.js'

export const GRANTS_API_VERSION = '2021-06-07'

export async function getUserGrants(): Promise<UserGrantsResponse> {
  const client = await getGlobalCliClient({
    apiVersion: GRANTS_API_VERSION,
    requireUser: true,
  })

  return client.request<UserGrantsResponse>({uri: '/users/me/grants'})
}
