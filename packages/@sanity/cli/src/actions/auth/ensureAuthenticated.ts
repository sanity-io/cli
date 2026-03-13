import {
  type CLITelemetryStore,
  getCliToken,
  type Output,
  type SanityOrgUser,
} from '@sanity/cli-core'
import {isHttpError} from '@sanity/client'

import {LoginError} from '../../errors/LoginError.js'
import {getCliUser} from '../../services/user.js'
import {getErrorMessage} from '../../util/getErrorMessage.js'
import {login} from './login/login.js'

/**
 * Ensure the user is authenticated. Validates the current token via /users/me
 * and triggers interactive login if the token is missing or invalid.
 *
 * @returns The authenticated user.
 * @throws LoginError if interactive login fails or is cancelled.
 * @throws Error if a network/server error occurs during validation.
 * @internal
 */
export async function ensureAuthenticated(options: {
  output: Output
  telemetry: CLITelemetryStore
}): Promise<SanityOrgUser> {
  const user = await validateSession()
  if (user) return user

  try {
    await login({output: options.output, telemetry: options.telemetry})
  } catch (cause) {
    throw new LoginError(getErrorMessage(cause), {cause})
  }

  try {
    return await getCliUser()
  } catch (cause) {
    if (isHttpError(cause) && (cause.statusCode === 401 || cause.statusCode === 403)) {
      throw new LoginError(
        `Login succeeded but failed to verify session: ${getErrorMessage(cause)}`,
        {cause},
      )
    }
    throw cause
  }
}

/**
 * Validate the current CLI auth token by calling /users/me.
 *
 * Returns null only for auth failures (401/403). Re-throws network errors,
 * timeouts, and server errors so callers can handle them appropriately
 * instead of triggering an unnecessary re-login prompt.
 *
 * @returns The authenticated user if valid, null if invalid/missing.
 * @internal
 */
export async function validateSession(): Promise<SanityOrgUser | null> {
  const token = await getCliToken()
  if (!token) return null

  try {
    return await getCliUser()
  } catch (error) {
    if (isHttpError(error) && (error.statusCode === 401 || error.statusCode === 403)) {
      return null
    }
    throw error
  }
}
