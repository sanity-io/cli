import {getSanityUrl} from '@sanity/cli-core'

export async function getCoreAppURL({
  httpHost = 'localhost',
  httpPort = 3333,
  organizationId,
}: {
  httpHost?: string
  httpPort?: number
  organizationId: string
}): Promise<string> {
  const url = `http://${httpHost}:${httpPort}`
  const params = new URLSearchParams({dev: url})

  return `${getSanityUrl()}/@${organizationId}?${params.toString()}`
}
