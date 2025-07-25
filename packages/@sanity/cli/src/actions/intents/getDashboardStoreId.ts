import {type DashboardStoreResource, type GetDashboardStoreIdOptions} from './types.js'

export async function getDashboardStoreId(options: GetDashboardStoreIdOptions) {
  const {client, organizationId} = options

  const {data: dashboards} = await client.withConfig({ignoreWarnings: ['experimental']}).request({
    query: {organizationId},
    uri: `/dashboards`,
  })

  if (
    dashboards.filter((dashboard: DashboardStoreResource) => dashboard.status === 'active')
      .length === 0
  ) {
    throw new Error(
      `Organization does not exist or is not fully initialized. Please visit https://sanity.io/@${organizationId} to complete the setup.`,
    )
  }

  return dashboards[0].id
}
