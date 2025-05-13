import {type FlagInput} from '@oclif/core/interfaces'

import {logout} from '../actions/auth/logout.js'
import {SanityCliCommand} from '../BaseCommand.js'
import {getCliToken} from '../config/cliToken.js'

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
