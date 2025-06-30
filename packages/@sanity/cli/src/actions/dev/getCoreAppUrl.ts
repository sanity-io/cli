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

  // Use the appropriate environment URL
  const baseUrl =
    process.env.SANITY_INTERNAL_ENV === 'staging' ? 'https://sanity.work' : 'https://sanity.io'

  return `${baseUrl}/@${organizationId}?${params.toString()}`
}
