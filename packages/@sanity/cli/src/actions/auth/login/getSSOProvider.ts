import {select} from '@sanity/cli-core/ux'

import {getSSOProviders} from '../../../services/auth.js'
import {type LoginProvider} from '../types.js'
import {samlProviderToLoginProvider} from './samlProviderToLoginProvider.js'

/**
 * Get the SSO provider for the given slug
 *
 * @param orgSlug - The slug of the organization to get the SSO provider for
 * @returns Promise that resolves to the SSO provider
 * @internal
 */
export async function getSSOProvider(orgSlug: string): Promise<LoginProvider | undefined> {
  const providers = await getSSOProviders(orgSlug)

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
