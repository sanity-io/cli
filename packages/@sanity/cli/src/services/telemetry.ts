import {getGlobalCliClient, getUserConfig} from '@sanity/cli-core'
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
 * Fetch the telemetry consent status for the current user
 * @returns The telemetry consent status
 *
 * @internal
 */
export async function fetchTelemetryConsent(): Promise<{
  status: ValidApiConsentStatus
}> {
  const telemetryConsentConfig = createExpiringConfig<{
    status: ValidApiConsentStatus
  }>({
    fetchValue: () => getTelemetryConsent(),
    key: TELEMETRY_CONSENT_CONFIG_KEY,
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
