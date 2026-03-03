import {getSanityUrl, subdebug} from '@sanity/cli-core'

const debug = subdebug('dev:getDashboardAppURL')

const DEFAULT_TIMEOUT = 5000

const getDefaultDashboardURL = ({
  organizationId,
  url,
}: {
  organizationId: string
  url: string
}): string => {
  return `${getSanityUrl()}/@${organizationId}?${new URLSearchParams({
    dev: url,
  }).toString()}`
}

/**
 * Gets the dashboard URL from API or uses the default dashboard URL
 */
export const getDashboardAppURL = async ({
  httpHost = 'localhost',
  httpPort = 3333,
  organizationId,
}: {
  httpHost?: string
  httpPort?: number
  organizationId: string
}): Promise<string> => {
  const url = `http://${httpHost}:${httpPort}`

  const abortController = new AbortController()
  // Wait for 5 seconds before aborting the request
  const timer = setTimeout(() => abortController.abort(), DEFAULT_TIMEOUT)
  try {
    const queryParams = new URLSearchParams({
      organizationId,
      url,
    })

    const res = await globalThis.fetch(
      `${getSanityUrl()}/api/dashboard/mode/development/resolve-url?${queryParams.toString()}`,
      {
        signal: abortController.signal,
      },
    )

    if (!res.ok) {
      debug(`Failed to fetch dashboard URL: ${res.statusText}`)
      return getDefaultDashboardURL({organizationId, url})
    }

    const body = await res.json()
    // <dashboard-app-url>/<orgniazationId>?dev=<dev-server-url>
    return body?.url ?? getDefaultDashboardURL({organizationId, url})
  } catch (err) {
    debug(`Failed to fetch dashboard URL: ${err instanceof Error ? err.message : String(err)}`)
    return getDefaultDashboardURL({organizationId, url})
  } finally {
    clearTimeout(timer)
  }
}
