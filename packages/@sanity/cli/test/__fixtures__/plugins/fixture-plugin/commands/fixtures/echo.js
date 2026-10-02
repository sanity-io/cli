import {Args} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core/SanityCommand'

export default class FixtureEcho extends SanityCommand {
  static args = {
    message: Args.string({description: 'Message to echo back', required: true}),
  }
  static description = 'Echo a message back from the fixture plugin'
  static flags = {}

  async run() {
    this.log(`fixture echo: ${this.args.message}`)
  }
}
