import {getGlobalCliClient, getUserConfig, isCi, isTrueish} from '@sanity/cli-core'

import {type ValidApiConsentStatus} from './isValidApiConsentStatus.js'
import {resolveConsent} from './resolveConsent.js'
import {telemetryDebug} from './telemetryDebug.js'
import {type ConsentInformation} from './types.js'

const TELEMETRY_CONSENT_CONFIG_KEY = 'telemetryConsent'

type SettableConsentStatus = Extract<ValidApiConsentStatus, 'denied' | 'granted'>

// Type guard for error objects with HTTP properties
function isHttpError(error: unknown): error is {
  message: string
  response?: {body?: {message?: string}}
  statusCode: number
} {
  return typeof error === 'object' && error !== null && 'statusCode' in error && 'message' in error
}

interface SetConsentOptions {
  env: NodeJS.ProcessEnv | {[key: string]: string | undefined}
  status: SettableConsentStatus
}

interface SetConsentResult {
  changed: boolean
  currentStatus: ConsentInformation
  message: string
}

export async function setConsent({env, status}: SetConsentOptions): Promise<SetConsentResult> {
  telemetryDebug('Setting telemetry consent to "%s"', status)

  // Check current consent status first
  const currentConsent = await resolveConsent({env})

  // Handle various blocking conditions
  if (isCi) {
    return {
      changed: false,
      currentStatus: currentConsent,
      message: 'Cannot set telemetry consent in CI environment',
    }
  }

  if (isTrueish(env.DO_NOT_TRACK) && status === 'granted') {
    return {
      changed: false,
      currentStatus: currentConsent,
      message:
        'Cannot enable telemetry while DO_NOT_TRACK environment variable is set. Unset DO_NOT_TRACK to enable telemetry.',
    }
  }

  // Check if already at desired status
  if (currentConsent.status === status) {
    const message =
      status === 'granted'
        ? "You've already enabled telemetry data collection to help us improve Sanity."
        : currentConsent.reason === 'localOverride'
          ? "You've already opted out of telemetry data collection.\nNo data is collected from your machine.\n\nUsing DO_NOT_TRACK environment variable."
          : "You've already opted out of telemetry data collection.\nNo data is collected from your Sanity account."

    return {
      changed: false,
      currentStatus: currentConsent,
      message,
    }
  }

  // User must be logged in to set consent
  if (currentConsent.status === 'undetermined' && currentConsent.reason === 'unauthenticated') {
    return {
      changed: false,
      currentStatus: currentConsent,
      message: 'You need to log in first to set telemetry preferences.',
    }
  }

  try {
    const client = await getGlobalCliClient({
      apiVersion: '2023-12-18',
      requireUser: true,
    })

    const uri = `/users/me/consents/telemetry/status/${status}`
    telemetryDebug('Sending telemetry consent status to %s', uri)

    await client.request({
      method: 'PUT',
      uri,
    })

    // Clear cached telemetry consent
    const userConfig = getUserConfig()
    userConfig.delete(TELEMETRY_CONSENT_CONFIG_KEY)

    const successMessage =
      status === 'granted'
        ? "You've now enabled telemetry data collection to help us improve Sanity."
        : "You've opted out of telemetry data collection.\nNo data will be collected from your Sanity account."

    const newConsent = await resolveConsent({env})

    return {
      changed: true,
      currentStatus: newConsent,
      message: successMessage,
    }
  } catch (err: unknown) {
    const errorMessage = `Failed to ${status === 'granted' ? 'enable' : 'disable'} telemetry`

    if (isHttpError(err) && err.statusCode === 403) {
      // Create a new error without stack trace from original error
      const message = err.response?.body?.message
        ? `${errorMessage}: ${err.response.body.message}`
        : errorMessage
      throw new Error(message)
    }

    if (isHttpError(err)) {
      // For other errors, preserve the original error but update the message
      err.message = err.response?.body?.message
        ? `${errorMessage}: ${err.response.body.message}`
        : errorMessage
      throw err
    }

    // For non-HTTP errors, wrap in a new error
    throw new Error(errorMessage)
  }
}
