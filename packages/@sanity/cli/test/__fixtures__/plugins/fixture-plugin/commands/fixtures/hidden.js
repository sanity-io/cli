import {SanityCommand} from '@sanity/cli-core/SanityCommand'

export default class FixtureHidden extends SanityCommand {
  static args = {}
  static description = 'Allowed command that is hidden from CLI users'
  static flags = {}
  static hidden = true

  async run() {
    this.log('fixture hidden')
  }
}
