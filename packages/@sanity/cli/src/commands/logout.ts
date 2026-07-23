import path from 'node:path'

import {
  exitCodes,
  getCliUserConfig,
  getUserConfig,
  SanityCommand,
  setCliUserConfig,
} from '@sanity/cli-core'
import {isHttpError} from '@sanity/client'

import {logout} from '../services/auth.js'
import {getMintedProjectRecord} from '../util/claimNudges.js'
import {readEnvValues} from '../util/envFile.js'

export class LogoutCommand extends SanityCommand<typeof LogoutCommand> {
  static override description = 'Log out of the current session'

  public async run(): Promise<void> {
    await this.parse(LogoutCommand)

    // Prevents SANITY_AUTH_TOKEN from causing errors when passed to session lookup endpoints.
    const envToken = process.env.SANITY_AUTH_TOKEN?.trim()
    if (envToken) {
      this.warn(
        'SANITY_AUTH_TOKEN is set in the environment (often via ./.env) — logging out cannot end it. Remove that variable to stop acting as its identity.',
      )
    }

    // getCliToken also authenticates from the unclaimed-projects ledger, ahead of the login
    // session, so in a minted directory the CLI keeps acting as the project robot after logout.
    // Surface that rather than reporting no credentials.
    const {SANITY_PROJECT_ID} = readEnvValues(path.join(process.cwd(), '.env'), [
      'SANITY_PROJECT_ID',
    ])
    const mintedRecord = SANITY_PROJECT_ID ? getMintedProjectRecord(SANITY_PROJECT_ID) : undefined
    if (mintedRecord) {
      this.warn(
        `This directory acts as unclaimed Sanity project ${SANITY_PROJECT_ID} via a stored robot token — logout cannot end that. Claim the project, or run sanity elsewhere, to stop acting as it.`,
      )
    }

    // Target the stored login session directly to avoid sending env token to session endpoint.
    const sessionToken = getCliUserConfig('authToken')
    if (!sessionToken) {
      if (!envToken && !mintedRecord) this.log('No login credentials found')
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
          `Failed to logout (HTTP ${error.response.statusCode}). Your local session was kept — try again shortly.`,
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
