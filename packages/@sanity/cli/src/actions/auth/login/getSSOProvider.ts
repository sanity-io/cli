import {isInteractive, subdebug} from '@sanity/cli-core'
import {select} from '@sanity/cli-core/ux'

import {getSSOProviders} from '../../../services/auth.js'
import {type LoginProvider} from '../types.js'
import {samlProviderToLoginProvider} from './samlProviderToLoginProvider.js'

const debug = subdebug('login:getSSOProvider')

/**
 * Get the SSO provider for the given slug
 *
 * @param orgSlug - The slug of the organization to get the SSO provider for
 * @param specifiedSSOProvider - Optional SSO provider name to select without prompting
 * @returns Promise that resolves to the SSO provider
 * @internal
 */
export async function getSSOProvider(
  orgSlug: string,
  specifiedSSOProvider?: string,
): Promise<LoginProvider | undefined> {
  try {
    const providers = await getSSOProviders(orgSlug)

    const enabledProviders = providers.filter((candidate) => !candidate.disabled)
    if (enabledProviders.length === 0) {
      return undefined
    }

    // If a specific SSO provider was requested, resolve it by name
    if (specifiedSSOProvider) {
      const match = enabledProviders.find(
        (p) => p.name.toLowerCase() === specifiedSSOProvider.toLowerCase(),
      )

      if (match) {
        return samlProviderToLoginProvider(match)
      }

      const available = enabledProviders.map((p) => p.name).join(', ')
      throw new Error(
        `Cannot find SSO provider "${specifiedSSOProvider}". ` +
          `Available SSO providers: ${available}`,
      )
    }

    // Auto-select when only one enabled provider exists
    if (enabledProviders.length === 1) {
      return samlProviderToLoginProvider(enabledProviders[0])
    }

    // Multiple providers and no flag — require interactive mode
    if (!isInteractive()) {
      const available = enabledProviders.map((p) => p.name).join(', ')
      throw new Error(
        `Multiple SSO providers available: ${available}. ` +
          'Use `--sso-provider <name>` to select one in unattended mode.',
      )
    }

    const selectedProvider = await select({
      choices: enabledProviders.map((provider) => ({name: provider.name, value: provider})),
      message: 'Select SSO provider',
    })

    return samlProviderToLoginProvider(selectedProvider)
  } catch (err) {
    debug('Error retrieving SSO Providers: %O', err)
    throw err
  }
}
