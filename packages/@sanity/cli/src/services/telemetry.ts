import {createHash} from 'node:crypto'

import {getCliToken, getGlobalCliClient, getUserConfig} from '@sanity/cli-core'
import {type TelemetryEvent} from '@sanity/telemetry'

import {telemetryDebug} from '../actions/telemetry/telemetryDebug.js'
import {createExpiringConfig} from '../util/createExpiringConfig.js'

export const TELEMETRY_API_VERSION = 'v2026-01-22'

export const VALID_API_STATUSES = ['granted', 'denied', 'unset'] as const
export type ValidApiConsentStatus = (typeof VALID_API_STATUSES)[number]

export async function sendEvents(batch: TelemetryEvent[]) {
  const client = await getGlobalCliClient({
    apiVersion: TELEMETRY_API_VERSION,
    requireUser: true,
  })

  const projectId = process.env.SANITY_TELEMETRY_PROJECT_ID

  return client.request({
    body: {batch, projectId},
    json: true,
    method: 'POST',
    uri: '/intake/batch',
  })
}

async function getTelemetryConsent(): Promise<{
  status: ValidApiConsentStatus
}> {
  const client = await getGlobalCliClient({
    apiVersion: TELEMETRY_API_VERSION,
    requireUser: false,
  })

  return client.request({tag: 'telemetry-consent', uri: '/intake/telemetry-status'})
}

/**
 * Check if the given status is a valid consent status
 *
 * @param status - The status to check
 * @returns True if the status is valid, false otherwise
 * @internal
 */
export function isValidApiConsentStatus(status: string): status is ValidApiConsentStatus {
  return VALID_API_STATUSES.includes(status as ValidApiConsentStatus)
}

/**
 * Check if the given response is a valid API consent response
 *
 * @param response - The response to check
 * @returns True if the response is valid, false otherwise
 * @internal
 */
function isValidApiConsentResponse(response: unknown): response is {status: ValidApiConsentStatus} {
  return (
    typeof response === 'object' &&
    response !== null &&
    'status' in response &&
    typeof response.status === 'string' &&
    isValidApiConsentStatus(response.status)
  )
}

export const TELEMETRY_CONSENT_CONFIG_KEY = 'telemetryConsent'
const FIVE_MINUTES = 1000 * 60 * 5

/**
 * Get a token-scoped cache key for telemetry consent. This ensures that switching
 * users (via login/logout) always results in a cache miss, preventing one user
 * from inheriting another user's cached consent status.
 *
 * @param token - The current auth token, or undefined if not logged in
 * @returns A cache key scoped to the token
 */
export function getTelemetryConsentCacheKey(token: string | undefined): string {
  if (!token) {
    return TELEMETRY_CONSENT_CONFIG_KEY
  }

  const hash = createHash('sha256').update(token).digest('hex').slice(0, 12)
  return `${TELEMETRY_CONSENT_CONFIG_KEY}:${hash}`
}

/**
 * Fetch the telemetry consent status for the current user
 * @returns The telemetry consent status
 *
 * @internal
 */
export async function fetchTelemetryConsent(): Promise<{
  status: ValidApiConsentStatus
}> {
  const token = await getCliToken()
  const cacheKey = getTelemetryConsentCacheKey(token)

  // NOTE: createExpiringConfig is instantiated on every call, so in-flight request
  // deduplication (via currentFetch) does not work across concurrent calls to
  // fetchTelemetryConsent(). Two concurrent callers will make two HTTP requests.
  // Consider moving to module-level instance if this becomes a bottleneck.
  const telemetryConsentConfig = createExpiringConfig<{
    status: ValidApiConsentStatus
  }>({
    fetchValue: () => getTelemetryConsent(),
    key: cacheKey,
    onCacheHit() {
      telemetryDebug('Retrieved telemetry consent status from cache')
    },
    onFetch() {
      telemetryDebug('Fetching telemetry consent status...')
    },
    onRevalidate() {
      telemetryDebug('Revalidating cached telemetry consent status...')
    },
    store: getUserConfig(),
    ttl: FIVE_MINUTES,
    validateValue: isValidApiConsentResponse,
  })

  return telemetryConsentConfig.get()
}
