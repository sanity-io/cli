import {
  exitCodes,
  getCliUserConfig,
  getUserConfig,
  SanityCommand,
  setCliUserConfig,
} from '@sanity/cli-core'
import {resolveCliCredential} from '@sanity/cli-core/config'
import {isHttpError} from '@sanity/client'

import {logout} from '../services/auth.js'
import {getMintedProjectRecord} from '../util/claimNudges.js'
import {TOKEN_ENV_FILES} from '../util/envFile.js'

export class LogoutCommand extends SanityCommand<typeof LogoutCommand> {
  static override description = 'Log out of the current session'

  public async run(): Promise<void> {
    await this.parse(LogoutCommand)

    // The active credential may be an environment or minted-project robot token, which logout
    // cannot end. Surface that instead of reporting no credentials. Only the stored login
    // session is ever revoked, so those tokens are never sent to the session logout endpoint.
    const credential = await resolveCliCredential()
    if (credential.source === 'environment') {
      this.warn(
        `SANITY_AUTH_TOKEN is set in the environment (often via ${TOKEN_ENV_FILES}). Logging out cannot end it. Remove that variable to stop acting as its identity.`,
      )
    } else if (credential.source === 'minted-project') {
      if (getMintedProjectRecord(credential.projectId)) {
        this.warn(
          `This directory acts as unclaimed Sanity project ${credential.projectId} via a stored robot token. Logout cannot end that. Claim the project, or run sanity elsewhere, to stop acting as it.`,
        )
      } else {
        this.warn(
          `This directory uses SANITY_AUTH_TOKEN from this project's .env for Sanity project ${credential.projectId}. Logout cannot end that. Remove SANITY_AUTH_TOKEN from that .env to stop acting as it.`,
        )
      }
    }

    // Target the stored login session directly to avoid sending the active token to the session
    // endpoint: an outranking credential must not prevent revoking a separately stored session.
    const sessionToken = getCliUserConfig('authToken')
    if (!sessionToken) {
      if (credential.source === 'none') this.log('No login credentials found')
      return
    }

    try {
      await logout(sessionToken)

      this.clearConfig()
    } catch (error) {
      // In the case of session timeouts or missing sessions, we'll get a 401
      // This is an acceptable situation seen from a logout perspective - all we
      // need to do in this case is clear the session from the view of the CLI
      if (isHttpError(error) && error.response.statusCode === 401) {
        this.clearConfig()
        return
      }
      // API failure bodies can name internal services — surface only the status, keep the
      // local credentials so a retry is possible.
      if (isHttpError(error)) {
        this.error(
          `Failed to logout (HTTP ${error.response.statusCode}). Your local session was kept; try again shortly.`,
          {exit: exitCodes.RUNTIME_ERROR},
        )
      }
      const err = error instanceof Error ? error : new Error(`${error}`)
      this.error(`Failed to logout: ${err.message}`, {exit: exitCodes.RUNTIME_ERROR})
    }
  }

  private clearConfig() {
    setCliUserConfig('authToken', undefined)
    getUserConfig().delete('telemetryConsent')

    this.log('Logged out successfully')
  }
}
