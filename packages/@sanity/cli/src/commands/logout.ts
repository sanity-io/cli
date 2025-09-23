import {getCliToken, SanityCommand, setConfig} from '@sanity/cli-core'
import {isHttpError} from '@sanity/client'

import {logout} from '../services/auth.js'

export class LogoutCommand extends SanityCommand<typeof LogoutCommand> {
  static override description = 'Logs out the CLI from the current user session'

  public async run(): Promise<void> {
    await this.parse(LogoutCommand)

    const previousToken = await getCliToken()
    if (!previousToken) {
      this.log('No login credentials found')
      return
    }

    try {
      await logout()

      this.clearConfig()
    } catch (error) {
      // In the case of session timeouts or missing sessions, we'll get a 401
      // This is an acceptable situation seen from a logout perspective - all we
      // need to do in this case is clear the session from the view of the CLI
      if (isHttpError(error) && error.response.statusCode === 401) {
        this.clearConfig()
        return
      }
      const err = error instanceof Error ? error : new Error(`${error}`)
      this.error(`Failed to logout: ${err.message}`, {exit: 1})
    }
  }

  private clearConfig() {
    setConfig('authToken', undefined)
    setConfig('telemetryConsent', undefined)

    this.log('Logged out successfully')
  }
}
