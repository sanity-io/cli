import {SanityCommand} from '@sanity/cli-core/SanityCommand'

export default class FixtureSecret extends SanityCommand {
  static args = {}
  static description = 'Command the fixture plugin declares as denied'
  static flags = {}

  async run() {
    this.log('fixture secret')
  }
}
