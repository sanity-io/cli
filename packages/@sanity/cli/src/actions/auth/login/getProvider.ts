import {input, spinner} from '@sanity/cli-core/ux'
import {type SanityClient} from '@sanity/client'

import {promptForProviders} from '../../../prompts/promptForProviders.js'
import {type LoginProvider, type ProvidersResponse} from '../types.js'
import {getSSOProvider} from './getSSOProvider.js'

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
  if (specifiedProvider === 'vercel') {
    return {
      name: 'vercel',
      title: 'Vercel',
      url: new URL('/v1/auth/login/vercel', client.config().apiHost).href,
    }
  }

  if (orgSlug) {
    return getSSOProvider(orgSlug)
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

  const provider = await promptForProviders(providers)
  if (provider.name === 'sso') {
    const orgSlug = await input({message: 'Organization slug:'})
    return getSSOProvider(orgSlug)
  }

  return provider
}
