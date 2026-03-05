import {subdebug} from '@sanity/cli-core'
import {input, spinner, SpinnerInstance} from '@sanity/cli-core/ux'

import {promptForProviders} from '../../../prompts/promptForProviders.js'
import {getProviders} from '../../../services/auth.js'
import {type LoginProvider} from '../types.js'
import {getSSOProvider} from './getSSOProvider.js'

const debug = subdebug('login:getProvider')

/**
 * Prompt the user to select a login provider, or use the specified provider if given.
 *
 * @param options - Options for the provider resolve operation
 * @returns Promise that resolves to the selected login provider
 * @internal
 */
export async function getProvider({
  experimental,
  orgSlug,
  specifiedProvider,
}: {
  experimental: boolean | undefined
  orgSlug: string | undefined
  specifiedProvider: string | undefined
}): Promise<LoginProvider | undefined> {
  let spin: SpinnerInstance | undefined

  try {
    if (orgSlug) {
      return getSSOProvider(orgSlug)
    }

    spin = spinner('Fetching providers...').start()
    // Fetch and prompt for login provider to use
    let {providers} = await getProviders()
    if (experimental) {
      providers = [...providers, {name: 'sso', title: 'SSO', url: '_not_used_'}]
    }
    spin.stop()

    if (specifiedProvider) {
      const provider = providers.find((prov) => prov.name === specifiedProvider)
      if (!provider) {
        throw new Error(`Cannot find login provider with name "${specifiedProvider}"`)
      }
      return provider
    }

    if (providers.length === 0) {
      return undefined
    }

    const provider = await promptForProviders(providers)
    if (provider.name === 'sso') {
      const orgSlug = await input({message: 'Organization slug:'})
      return getSSOProvider(orgSlug)
    }

    return provider
  } catch (err) {
    spin?.stop()
    debug('Error retrieving providers', err)
    throw err
  }
}
