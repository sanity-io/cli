import {input} from '@inquirer/prompts'
import {spinner} from '@sanity/cli-core'
import {type SanityClient} from '@sanity/client'

import {type LoginProvider, type ProvidersResponse} from '../types.js'
import {getSSOProvider} from './getSSOProvider.js'
import {promptProviders} from './promptProviders.js'

/**
 * Prompt the user to select a login provider, or use the specified provider if given.
 *
 * @param options - Options for the provider resolve operation
 * @returns Promise that resolves to the selected login provider
 * @internal
 */
export async function getProvider({
  client,
  experimental,
  orgSlug,
  specifiedProvider,
}: {
  client: SanityClient
  experimental: boolean | undefined
  orgSlug: string | undefined
  specifiedProvider: string | undefined
}): Promise<LoginProvider | undefined> {
  if (orgSlug) {
    return getSSOProvider({client, orgSlug})
  }

  // Fetch and prompt for login provider to use
  const spin = spinner('Fetching providers...').start()
  let {providers} = await client.request<ProvidersResponse>({uri: '/auth/providers'})
  if (experimental) {
    providers = [...providers, {name: 'sso', title: 'SSO', url: '_not_used_'}]
  }
  spin.stop()

  const providerNames = providers.map((prov) => prov.name)

  if (specifiedProvider && providerNames.includes(specifiedProvider)) {
    const provider = providers.find((prov) => prov.name === specifiedProvider)

    if (!provider) {
      throw new Error(`Cannot find login provider with name "${specifiedProvider}"`)
    }

    return provider
  }

  const provider = await promptProviders(providers)
  if (provider.name === 'sso') {
    const orgSlug = await input({message: 'Organization slug:'})
    return getSSOProvider({client, orgSlug})
  }

  return provider
}
