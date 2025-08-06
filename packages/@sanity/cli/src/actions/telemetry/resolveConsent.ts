import {
  createExpiringConfig,
  getCliToken,
  getGlobalCliClient,
  getUserConfig,
  isCi,
  isTrueish,
} from '@sanity/cli-core'

import {
  isValidApiConsentStatus,
  VALID_API_STATUSES,
  type ValidApiConsentStatus,
} from './isValidApiConsentStatus.js'
import {telemetryDebug} from './telemetryDebug.js'
import {type ConsentInformation} from './types.js'

const FIVE_MINUTES = 1000 * 60 * 5

interface Env {
  DO_NOT_TRACK?: string
  SANITY_TELEMETRY_INSPECT?: string
}

interface Options {
  env: Env | NodeJS.ProcessEnv
}

const TELEMETRY_CONSENT_CONFIG_KEY = 'telemetryConsent'

function parseApiConsentStatus(value: unknown): ValidApiConsentStatus {
  if (typeof value === 'string' && isValidApiConsentStatus(value)) {
    return value
  }
  throw new Error(`Invalid consent status. Must be one of: ${VALID_API_STATUSES.join(', ')}`)
}

export async function resolveConsent({env}: Options): Promise<ConsentInformation> {
  telemetryDebug('Resolving consent…')
  if (isCi) {
    telemetryDebug('CI environment detected, treating telemetry consent as denied')
    return {status: 'denied'}
  }
  if (isTrueish(env.DO_NOT_TRACK)) {
    telemetryDebug('DO_NOT_TRACK is set, consent is denied')
    return {
      reason: 'localOverride',
      status: 'denied',
    }
  }

  const token = await getCliToken()
  if (!token) {
    telemetryDebug('User is not logged in, consent is undetermined')
    return {
      reason: 'unauthenticated',
      status: 'undetermined',
    }
  }

  const client = await getGlobalCliClient({
    apiVersion: '2023-12-18',
    requireUser: false,
  })

  function fetchConsent(): Promise<{
    status: ValidApiConsentStatus
  }> {
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

  try {
    const response = await fetchConsent()

    telemetryDebug('User consent status is %s', response.status)
    return {status: parseApiConsentStatus(response.status)}
  } catch (err) {
    telemetryDebug('Failed to fetch user consent status, treating it as "undetermined": %s', err)
    return {
      reason: 'fetchError',
      status: 'undetermined',
    }
  }
}
