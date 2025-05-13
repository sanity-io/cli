import {Command, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'

import {SanityCliCommand} from '../BaseCommand.js'

export class DevCommand extends SanityCliCommand<typeof DevCommand> {
  static override description =
    'Starts a local development server for Sanity Studio with live reloading'

  static override examples = [
    '<%= config.bin %> <%= command.id %> --host=0.0.0.0',
    '<%= config.bin %> <%= command.id %> --port=1942',
  ] satisfies Array<Command.Example>

  static override flags = {
    host: Flags.string({
      default: '127.0.0.1',
      description: 'The local network interface at which to listen',
    }),
    port: Flags.integer({
      default: 3333,
      description: 'TCP port to start server on',
      max: 65_535,
      min: 1,
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {flags} = await this.parse(DevCommand)

    console.log(flags)
  }
}
