import {createExpiringConfig, getGlobalCliClient, getUserConfig} from '@sanity/cli-core'

import {type ValidApiConsentStatus} from './isValidApiConsentStatus.js'
import {telemetryDebug} from './telemetryDebug.js'

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
  const client = await getGlobalCliClient({
    apiVersion: '2025-08-14',
    requireUser: false,
  })

  const telemetryConsentConfig = createExpiringConfig<{
    status: ValidApiConsentStatus
  }>({
    fetchValue: () => client.request({tag: 'telemetry-consent', uri: '/intake/telemetry-status'}),
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
  })

  return telemetryConsentConfig.get()
}
