import {type ConsentInformation, getCliToken, isCi} from '@sanity/cli-core'

import {
  fetchTelemetryConsent,
  isValidApiConsentStatus,
  VALID_API_STATUSES,
  type ValidApiConsentStatus,
} from '../../services/telemetry.js'
import {isTrueish} from './isTrueish.js'
import {telemetryDebug} from './telemetryDebug.js'

function parseApiConsentStatus(value: unknown): ValidApiConsentStatus {
  if (typeof value === 'string' && isValidApiConsentStatus(value)) {
    return value
  }
  throw new Error(`Invalid consent status. Must be one of: ${VALID_API_STATUSES.join(', ')}`)
}

export async function resolveConsent(): Promise<ConsentInformation> {
  telemetryDebug('Resolving consent…')
  if (isCi()) {
    telemetryDebug('CI environment detected, treating telemetry consent as denied')
    return {status: 'denied'}
  }

  if (isTrueish(process.env.DO_NOT_TRACK)) {
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

  try {
    const response = await fetchTelemetryConsent()

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
