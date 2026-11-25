import {type SanityClient} from '@sanity/client'

import {
  type LoginProvider,
  type ProvidersResponse,
  type SamlLoginProvider,
  type TokenDetails,
} from './authTypes.js'

export {startServerForTokenCallback} from './authServer.js'
export type {
  LoginProvider,
  ProvidersResponse,
  SamlLoginProvider,
  TokenDetails,
} from './authTypes.js'
export {canLaunchBrowser} from './canLaunchBrowser.js'

export const AUTH_API_VERSION = 'v2025-09-23'

export function getLoginProviders(client: SanityClient): Promise<ProvidersResponse> {
  return client.request({url: '/auth/providers'})
}

export function getSamlLoginProviders(
  client: SanityClient,
  orgSlug: string,
): Promise<SamlLoginProvider[]> {
  return client.request({
    url: `/auth/organizations/by-slug/${encodeURIComponent(orgSlug)}/providers`,
  })
}

export function exchangeLoginSession(client: SanityClient, query: string): Promise<TokenDetails> {
  return client.request({url: `/auth/fetch${query}`})
}

export async function selectInteractiveLoginProvider(
  providers: LoginProvider[],
  select: (choices: LoginProvider[]) => Promise<LoginProvider>,
  selectSso: () => Promise<LoginProvider | undefined>,
): Promise<LoginProvider | undefined> {
  if (providers.length === 0) return undefined

  const provider = await select([
    ...providers.filter(({name}) => name !== 'sso'),
    {name: 'sso', title: 'SSO', url: '_not_used_'},
  ])
  return provider.name === 'sso' ? selectSso() : provider
}

function samlLoginProvider(provider: SamlLoginProvider): LoginProvider {
  return {name: provider.name, title: provider.name, url: provider.loginUrl}
}

export async function selectSamlLoginProvider(
  providers: SamlLoginProvider[],
  {
    interactive,
    select,
    specified,
  }: {
    interactive: boolean
    select: (providers: SamlLoginProvider[]) => Promise<SamlLoginProvider>
    specified?: string
  },
): Promise<LoginProvider | undefined> {
  const enabled = providers.filter((provider) => !provider.disabled)
  if (specified) {
    if (enabled.length === 0) {
      throw new Error(
        `Cannot find SSO provider "${specified}". No SSO providers are enabled for this organization.`,
      )
    }
    const match = enabled.find(
      (provider) => provider.name.toLowerCase() === specified.toLowerCase(),
    )
    if (match) return samlLoginProvider(match)

    throw new Error(
      `Cannot find SSO provider "${specified}". ` +
        `Available SSO providers: ${enabled.map((provider) => provider.name).join(', ')}`,
    )
  }

  if (enabled.length === 0) return undefined
  if (enabled.length === 1) return samlLoginProvider(enabled[0])
  if (!interactive) {
    throw new Error(
      `Multiple SSO providers available: ${enabled.map((provider) => provider.name).join(', ')}. ` +
        'Use `--sso-provider <name>` to select one in unattended mode.',
    )
  }
  return samlLoginProvider(await select(enabled))
}
