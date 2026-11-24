import {isInteractive, subdebug} from '@sanity/cli-core'
import {select} from '@sanity/cli-core/ux'
import {selectSamlLoginProvider} from '@sanity/cli-setup/auth'

import {getSSOProviders} from '../../../services/auth.js'
import {type LoginProvider} from '../types.js'

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

    return await selectSamlLoginProvider(providers, {
      interactive: isInteractive(),
      select: (choices) =>
        select({
          choices: choices.map((provider) => ({name: provider.name, value: provider})),
          message: 'Select SSO provider',
        }),
      specified: specifiedSSOProvider,
    })
  } catch (err) {
    debug('Error retrieving SSO Providers: %O', err)
    throw err
  }
}
