import {select} from '@inquirer/prompts'
import {type SanityClient} from '@sanity/client'

import {type LoginProvider, type SamlLoginProvider} from '../types.js'
import {samlProviderToLoginProvider} from './samlProviderToLoginProvider.js'

/**
 * Get the SSO provider for the given slug
 *
 * @param options - Options for the provider resolve operation
 * @returns Promise that resolves to the SSO provider
 * @internal
 */
export async function getSSOProvider({
  client,
  orgSlug,
}: {
  client: SanityClient
  orgSlug: string
}): Promise<LoginProvider | undefined> {
  const providers = await client.request<SamlLoginProvider[]>({
    uri: `/auth/organizations/by-slug/${orgSlug}/providers`,
  })

  const enabledProviders = providers.filter((candidate) => !candidate.disabled)
  if (enabledProviders.length === 0) {
    return undefined
  }

  if (enabledProviders.length === 1) {
    return samlProviderToLoginProvider(enabledProviders[0])
  }

  const selectedProvider = await select({
    choices: enabledProviders.map((provider) => ({name: provider.name, value: provider})),
    message: 'Select SSO provider',
  })

  return selectedProvider ? samlProviderToLoginProvider(selectedProvider) : undefined
}
