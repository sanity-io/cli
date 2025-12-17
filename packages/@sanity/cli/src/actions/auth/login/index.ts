import {getCliToken, getGlobalCliClient, type Output, setConfig, spinner} from '@sanity/cli-core'
import open from 'open'

import {canLaunchBrowser} from '../../../util/canLaunchBrowser.js'
import {startServerForTokenCallback} from '../authServer.js'
import {getProvider} from './getProvider.js'

const LOGIN_API_VERSION = '2024-02-01'

export interface LoginOptions {
  output: Output

  experimental?: boolean
  open?: boolean
  provider?: string
  sso?: string
}

/**
 * Trigger the authentication flow for the CLI.
 *
 * NOTE: This uses terminal prompts and will not work for non-interactive/programmatic uses.
 *
 * @param options - Options for the login operation
 * @returns Promise that resolves when the login operation is complete
 * @throws Will throw if login fails or is cancelled
 * @internal
 */
export async function login(options: LoginOptions) {
  const {output} = options
  const previousToken = await getCliToken()
  const hasExistingToken = Boolean(previousToken)

  // @todo start telemetry trace

  // We explicitly want to use an unauthenticated client here, even if we already logged in
  const globalClient = await getGlobalCliClient({apiVersion: LOGIN_API_VERSION})
  const client = globalClient.withConfig({token: undefined})

  const provider = await getProvider({
    client,
    experimental: options.experimental,
    orgSlug: options.sso,
    specifiedProvider: options.provider,
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
  const shouldLaunchBrowser = canLaunchBrowser() && options.open !== false
  const actionText = shouldLaunchBrowser ? 'Opening browser at' : 'Please open a browser at'

  output.log(`\n${actionText} ${loginUrl.href}\n`)

  const spin = spinner('Waiting for browser login to complete... Press Ctrl + C to cancel').start()

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
  await setConfig('telemetryConsent', undefined)

  // If we had a session previously, attempt to clear it
  if (hasExistingToken) {
    await globalClient
      .withConfig({token: previousToken})
      .request({method: 'POST', uri: '/auth/logout'})
      .catch((err) => {
        const statusCode = err && err.response && err.response.statusCode
        if (statusCode !== 401) {
          output.warn('Failed to invalidate previous session')
        }
      })
  }
}
