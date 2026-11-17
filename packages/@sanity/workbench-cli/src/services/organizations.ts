import {getGlobalCliClient} from '@sanity/cli-core'

const ORGANIZATIONS_API_VERSION = 'v2025-05-14'

export async function getOrganization(
  organizationId: string,
  signal?: AbortSignal,
): Promise<{name: string}> {
  const client = await getGlobalCliClient({
    apiVersion: ORGANIZATIONS_API_VERSION,
    requireUser: true,
  })

  return client.request({signal, url: `/organizations/${organizationId}`})
}
