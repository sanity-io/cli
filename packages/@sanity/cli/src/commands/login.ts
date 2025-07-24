import {input, select} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {
  getCliToken,
  getGlobalCliClient,
  SanityCliCommand,
  setConfig,
  spinner,
} from '@sanity/cli-core'
import {type SanityClient} from '@sanity/client'
import open from 'open'

import {startServerForTokenCallback} from '../actions/auth/authServer.js'
import {
  type LoginProvider,
  type ProvidersResponse,
  type SamlLoginProvider,
} from '../actions/auth/types.js'
import {canLaunchBrowser} from '../util/canLaunchBrowser.js'

const LOGIN_API_VERSION = '2024-02-01'

export class LoginCommand extends SanityCliCommand<typeof LoginCommand> {
  static override description = 'Authenticates the CLI for access to Sanity projects'
  static override examples: Array<Command.Example> = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Log in using default settings',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --sso my-organization',
      description: 'Log in using Single Sign-On with the "my-organization" slug',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --provider github --no-open',
      description: 'Login with GitHub provider, but do not open a browser window automatically',
    },
  ]
  static override flags = {
    experimental: Flags.boolean({
      default: false,
      hidden: true,
    }),
    open: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Open a browser window to log in (`--no-open` only prints URL)',
    }),
    provider: Flags.string({
      description: 'Log in using the given provider',
      helpValue: '<providerId>',
    }),
    sso: Flags.string({
      description: 'Log in using Single Sign-On, using the given organization slug',
      helpValue: '<slug>',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {flags} = await this.parse(LoginCommand)

    const previousToken = await getCliToken()
    const hasExistingToken = Boolean(previousToken)

    // @todo start telemetry trace

    // We explicitly want to use an unauthenticated client here, even if we already logged in
    const globalClient = await getGlobalCliClient({apiVersion: LOGIN_API_VERSION})
    const client = globalClient.withConfig({token: undefined})

    const provider = await getProvider({
      client,
      experimental: flags.experimental,
      orgSlug: flags.sso,
      specifiedProvider: flags.provider,
    })

    // @todo trace.log({step: 'selectProvider', provider: provider?.name})

    if (provider === undefined) {
      throw new Error('No authentication providers found')
    }

    const {
      loginUrl,
      server,
      token: tokenPromise,
    } = await startServerForTokenCallback({client, providerUrl: provider.url})

    // @todo trace.log({step: 'waitForToken'})

    const serverUrl = server.address()
    if (!serverUrl || typeof serverUrl === 'string') {
      // Note: `serverUrl` is string only when binding to unix sockets,
      // thus we can safely assume Something Is Wrong™ if it's a string
      throw new Error('Failed to start auth callback server')
    }

    // Open a browser on the login page (or tell the user to)
    const shouldLaunchBrowser = canLaunchBrowser() && flags.open !== false
    const actionText = shouldLaunchBrowser ? 'Opening browser at' : 'Please open a browser at'

    this.log(`\n${actionText} ${loginUrl.href}\n`)

    const spin = spinner(
      'Waiting for browser login to complete... Press Ctrl + C to cancel',
    ).start()

    if (shouldLaunchBrowser) {
      open(loginUrl.href)
    }

    // Wait for a success/error on the HTTP callback server
    let authToken: string
    try {
      authToken = (await tokenPromise).token
      spin.stop()
    } catch (err: unknown) {
      spin.stop()
      // @todo trace.error(err)
      throw err instanceof Error
        ? new Error(`Login failed: ${err.message}`, {cause: err})
        : new Error(`${err}`)
    } finally {
      server.close()
      server.unref()
    }

    // Store the token
    await setConfig('authToken', authToken)

    // Clear cached telemetry consent
    setConfig('telemetryConsent', undefined)

    // If we had a session previously, attempt to clear it
    if (hasExistingToken) {
      await globalClient
        .withConfig({token: previousToken})
        .request({method: 'POST', uri: '/auth/logout'})
        .catch((err) => {
          const statusCode = err && err.response && err.response.statusCode
          if (statusCode !== 401) {
            this.warn('Failed to invalidate previous session')
          }
        })
    }

    this.log('Login successful')

    // @todo trace.complete()
  }
}

/**
 * Prompt the user to select a login provider, or use the specified provider if given.
 *
 * @param options - Options for the provider resolve operation
 * @returns Promise that resolves to the selected login provider
 * @internal
 */
async function getProvider({
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

/**
 * Get the SSO provider for the given slug
 *
 * @param options - Options for the provider resolve operation
 * @returns Promise that resolves to the SSO provider
 * @internal
 */
async function getSSOProvider({
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

/**
 * Prompts the user to select a provider from the given list of providers,
 * or if only one provider is available, returns that provider.
 *
 * @param providers - The list of login providers
 * @returns The selected login provider
 * @internal
 */
async function promptProviders(providers: LoginProvider[]): Promise<LoginProvider> {
  if (providers.length === 1) {
    return providers[0]
  }

  const provider = await select({
    choices: providers.map((choice) => ({name: choice.title, value: choice})),
    message: 'Please log in or create a new account',
  })

  return provider || providers[0]
}

/**
 * Converts a SAML login provider shape to a login provider shape
 *
 * @param saml - The SAML login provider
 * @returns The login provider
 * @internal
 */
function samlProviderToLoginProvider(saml: SamlLoginProvider): LoginProvider {
  return {
    name: saml.name,
    title: saml.name,
    url: saml.loginUrl,
  }
}
