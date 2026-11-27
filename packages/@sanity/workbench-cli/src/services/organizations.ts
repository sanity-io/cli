import {getGlobalCliClient} from '@sanity/cli-core'

// From this version `slug` is the org's host slug: `null` when the org has none or can't use one.
const ORGANIZATIONS_API_VERSION = 'v2026-11-27'

export async function getOrganization(
  organizationId: string,
  signal?: AbortSignal,
): Promise<{name: string; slug: string | null}> {
  const client = await getGlobalCliClient({
    apiVersion: ORGANIZATIONS_API_VERSION,
    requireUser: true,
  })

  return client.request({signal, url: `/organizations/${organizationId}`})
}
