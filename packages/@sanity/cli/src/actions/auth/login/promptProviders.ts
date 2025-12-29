import {select} from '@sanity/cli-core/ux'

import {type LoginProvider} from '../types.js'

/**
 * Prompts the user to select a provider from the given list of providers,
 * or if only one provider is available, returns that provider.
 *
 * @param providers - The list of login providers
 * @returns The selected login provider
 * @internal
 */
export async function promptProviders(providers: LoginProvider[]): Promise<LoginProvider> {
  if (providers.length === 1) {
    return providers[0]
  }

  const provider = await select({
    choices: providers.map((choice) => ({name: choice.title, value: choice})),
    message: 'Please log in or create a new account',
  })

  return provider || providers[0]
}
