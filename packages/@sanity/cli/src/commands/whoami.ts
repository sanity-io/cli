import {Flags} from '@oclif/core'
import {exitCodes, getCliTokenInfo, SanityCommand} from '@sanity/cli-core'

import {getProviderName} from '../actions/auth/getProviderName.js'
import {formatKeyValue} from '../actions/debug/output.js'
import {getCliUser} from '../services/user.js'

export class WhoamiCommand extends SanityCommand<typeof WhoamiCommand> {
  static override description = 'Show the user or API token the CLI is authenticated as'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Show the currently authenticated user',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --json',
      description: 'Output the current user as JSON, for scripts and agents',
    },
  ]

  static override flags = {
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(WhoamiCommand)

    const tokenInfo = await getCliTokenInfo()
    if (!tokenInfo?.token) {
      this.error('Not logged in. Run `sanity login` to authenticate.', {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    const user = await getCliUser()
    const result = {
      email: user.email ?? null,
      id: user.id,
      name: user.name,
      provider: user.provider,
      tokenSource: tokenInfo.source,
    }

    if (flags.json) {
      this.log(JSON.stringify(result, null, 2))
      return
    }

    const padTo = 8 // "Provider" is the longest key
    this.log(formatKeyValue('Name', result.name, {indent: 0, padTo}))
    if (result.email) {
      this.log(formatKeyValue('Email', result.email, {indent: 0, padTo}))
    }
    this.log(formatKeyValue('ID', result.id, {indent: 0, padTo}))
    this.log(formatKeyValue('Provider', formatProvider(result.provider), {indent: 0, padTo}))
    this.log(formatKeyValue('Token', result.tokenSource, {indent: 0, padTo}))
  }
}

function formatProvider(provider: string): string {
  if (provider === 'sanity-token') return 'API token'
  if (provider.startsWith('saml-')) return `SAML (${provider.slice('saml-'.length)})`
  return getProviderName(provider)
}
