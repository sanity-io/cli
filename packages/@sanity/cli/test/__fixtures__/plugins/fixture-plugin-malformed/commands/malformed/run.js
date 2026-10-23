import {SanityCommand} from '@sanity/cli-core/SanityCommand'

export default class MalformedRun extends SanityCommand {
  static args = {}
  static description = 'Command whose plugin declares a malformed policy table'
  static flags = {}

  async run() {
    this.log('malformed run')
  }
}
