import {type FlagInput} from '@oclif/core/interfaces'
import {getCliToken, SanityCliCommand} from '@sanity/cli-core'

import {logout} from '../actions/auth/logout.js'

export class LogoutCommand extends SanityCliCommand<typeof LogoutCommand> {
  static override description = 'Logs out the CLI from the current user session'
  static override flags = {} satisfies FlagInput

  public async run(): Promise<void> {
    // Parse to ensure no invalid flags are passed
    await this.parse(LogoutCommand)

    const previousToken = await getCliToken()
    if (!previousToken) {
      this.log('No login credentials found')
      return
    }

    await logout()

    this.log('Logged out successfully')
  }
}
