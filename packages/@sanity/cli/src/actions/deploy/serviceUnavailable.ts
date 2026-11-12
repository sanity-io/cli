import {getErrorMessage} from '@sanity/cli-core/errors'

const STATUS_PAGE_URL = 'https://www.sanity-status.com'

const UNAVAILABLE_STATUS_CODES = new Set([502, 503, 504])

const NETWORK_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
])

/**
 * Describes a deploy request that failed because the Sanity API is down or
 * unreachable, rather than because it rejected the request. Returns
 * `undefined` for any other error, whose own message is more useful.
 */
export function describeServiceUnavailable(err: unknown): string | undefined {
  const statusCode = (err as {statusCode?: unknown})?.statusCode
  if (typeof statusCode === 'number' && UNAVAILABLE_STATUS_CODES.has(statusCode)) {
    return `Sanity’s deployment service is unavailable (HTTP ${statusCode}). This is usually temporary, so try again in a few minutes. Check ${STATUS_PAGE_URL} for ongoing incidents.`
  }

  const reason = getNetworkFailureReason(err)
  if (reason) {
    return `Couldn’t reach the Sanity API (${reason}). Check your internet connection and proxy settings, then try again. If the problem continues, check ${STATUS_PAGE_URL} for ongoing incidents.`
  }

  return undefined
}

export function getDeployErrorMessage(err: unknown): string {
  return describeServiceUnavailable(err) ?? getErrorMessage(err)
}

// Duck-typed rather than `instanceof`: the client can run on a host-provided
// fetch, whose rejections needn't be this realm's Error instances.
function getNetworkFailureReason(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const {cause, code, message, name} = err as Record<string, unknown>

  if (name === 'TimeoutError') return 'request timed out'

  // fetch rejects with a bare "fetch failed" and puts the socket error on `cause`
  if (name === 'TypeError' && message === 'fetch failed') {
    const causeCode = (cause as {code?: unknown} | undefined)?.code
    return typeof causeCode === 'string' ? causeCode : 'network error'
  }

  return typeof code === 'string' && NETWORK_ERROR_CODES.has(code) ? code : undefined
}
