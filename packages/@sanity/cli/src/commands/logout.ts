import {
  exitCodes,
  getCliUserConfig,
  getUserConfig,
  SanityCommand,
  setCliUserConfig,
} from '@sanity/cli-core'
import {isHttpError} from '@sanity/client'

import {logout} from '../services/auth.js'

export class LogoutCommand extends SanityCommand<typeof LogoutCommand> {
  static override description = 'Log out of the current session'

  public async run(): Promise<void> {
    await this.parse(LogoutCommand)

    // An env-sourced token (SANITY_AUTH_TOKEN, often loaded from ./.env) is not a login
    // session: there is nothing server-side to end, and clearing local config would not stop
    // the next command from picking the variable up again. Robot tokens from `sanity new` make
    // the session endpoint reject outright — so say what to do instead of calling it.
    const envToken = process.env.SANITY_AUTH_TOKEN?.trim()
    if (envToken) {
      this.warn(
        'SANITY_AUTH_TOKEN is set in the environment (often via ./.env) — logging out cannot end it. Remove that variable to stop acting as its identity.',
      )
    }

    // Target the stored login session directly: `getCliToken()` prefers the env token, which is
    // exactly the credential `sanity logout` must not send to the session endpoint.
    const sessionToken = getCliUserConfig('authToken')
    if (!sessionToken) {
      if (!envToken) this.log('No login credentials found')
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
