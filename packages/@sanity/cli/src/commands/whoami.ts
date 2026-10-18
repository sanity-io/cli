import {Flags} from '@oclif/core'
import {exitCodes, getCliTokenInfo, SanityCommand} from '@sanity/cli-core'

import {getProviderName} from '../actions/auth/getProviderName.js'
import {formatKeyValue} from '../actions/debug/output.js'
import {
  getSamlProviderId,
  resolveSSOProvider,
  type SSOProviderInfo,
} from '../actions/whoami/resolveSSOProvider.js'
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
    const samlProviderId = getSamlProviderId(user.provider)
    const sso = samlProviderId ? await resolveSSOProvider(samlProviderId) : undefined

    if (flags.json) {
      this.log(
        JSON.stringify(
          {
            email: user.email ?? null,
            id: user.id,
            name: user.name,
            provider: user.provider,
            ...(samlProviderId ? {sso: sso ?? null} : {}),
            tokenSource: tokenInfo.source,
          },
          null,
          2,
        ),
      )
      return
    }

    const padTo = 8 // "Provider" is the longest key
    this.log(formatKeyValue('Name', user.name, {indent: 0, padTo}))
    if (user.email) {
      this.log(formatKeyValue('Email', user.email, {indent: 0, padTo}))
    }
    this.log(formatKeyValue('ID', user.id, {indent: 0, padTo}))
    this.log(
      formatKeyValue('Provider', formatProvider(user.provider, samlProviderId, sso), {
        indent: 0,
        padTo,
      }),
    )
    if (sso) {
      this.log(formatKeyValue('Org', formatOrganization(sso), {indent: 0, padTo}))
    }
    this.log(formatKeyValue('Token', tokenInfo.source, {indent: 0, padTo}))
  }
}

function formatProvider(
  provider: string,
  samlProviderId: string | undefined,
  sso: SSOProviderInfo | undefined,
): string {
  if (provider === 'sanity-token') return 'API token'
  if (samlProviderId) return formatSamlProvider(sso)
  return getProviderName(provider)
}

function formatOrganization(sso: SSOProviderInfo): string {
  if (!sso.organizationSlug) return sso.organizationName
  return `${sso.organizationName} (sanity login --sso ${sso.organizationSlug})`
}

function formatSamlProvider(sso: SSOProviderInfo | undefined): string {
  // Provider names like "saml" or "SSO" repeat the label without adding anything
  const name = sso?.providerName.trim()
  if (!name || /^(saml|sso|saml sso)$/i.test(name)) return 'SAML SSO'
  return `SAML SSO (${name})`
}
