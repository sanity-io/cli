import {type SanityDocument} from '@sanity/client'

import {type QueryDashboardStoreOptions} from './types.js'

export async function queryDashboardStore<T = SanityDocument | SanityDocument[]>(
  options: QueryDashboardStoreOptions,
): Promise<T> {
  const {client, dashboardStoreId, query} = options

  const {result} = await client
    // need to update the client with Renovate
    // .withConfig({ignoreWarnings: ['experimental']})
    .request({
      query: {
        query,
      },
      uri: `/dashboards/${dashboardStoreId}/query`,
    }) 

  return result
}