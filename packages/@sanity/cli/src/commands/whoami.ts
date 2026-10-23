import {exitCodes, getCliTokenInfo, SanityCommand} from '@sanity/cli-core'
import {isHttpError} from '@sanity/client'

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

  static override enableJsonFlag = true

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

  public async run(): Promise<void> {
    const {json} = this.flags

    const tokenInfo = await getCliTokenInfo()
    if (!tokenInfo?.token) {
      this.error('Not logged in. Run `sanity login` to authenticate.', {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    const user = await getCliUser().catch((err: unknown) => {
      // A stale SANITY_AUTH_TOKEN overrides a valid saved login, so "run sanity login" won't help
      if (tokenInfo.source === ENV_TOKEN_SOURCE && isRejectedToken(err)) {
        this.error(
          'Authentication failed using SANITY_AUTH_TOKEN.\nUnset it to use your saved login, or replace it with a valid token.',
          {exit: exitCodes.RUNTIME_ERROR},
        )
      }
      throw err
    })
    const samlProviderId = getSamlProviderId(user.provider)
    const sso = samlProviderId ? await resolveSSOProvider(samlProviderId) : undefined

    if (json) {
      this.logJson({
        email: user.email ?? null,
        id: user.id,
        name: user.name,
        provider: user.provider,
        ...(samlProviderId ? {sso: sso ?? null} : {}),
        tokenSource: tokenInfo.source,
      })
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

const ENV_TOKEN_SOURCE = 'SANITY_AUTH_TOKEN environment variable'

function isRejectedToken(err: unknown): boolean {
  return isHttpError(err) && (err.statusCode === 401 || err.statusCode === 403)
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
