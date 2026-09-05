import {SanityCommand} from '@sanity/cli-core/SanityCommand'

export default class BrokenRun extends SanityCommand {
  static args = {}
  static description = 'Command whose plugin policy module fails to load'
  static flags = {}

  async run() {
    this.log('broken run')
  }
}
