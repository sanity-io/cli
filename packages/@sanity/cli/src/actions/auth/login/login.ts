import {
  type CLITelemetryStore,
  getCliToken,
  getUserConfig,
  type Output,
  setCliUserConfig,
  subdebug,
} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import open from 'open'

import {logout} from '../../../services/auth.js'
import {LoginTrace} from '../../../telemetry/login.telemetry.js'
import {canLaunchBrowser} from '../../../util/canLaunchBrowser.js'
import {startServerForTokenCallback} from '../authServer.js'
import {getProvider} from './getProvider.js'

const debug = subdebug('login')

interface LoginOptions {
  output: Output

  telemetry: CLITelemetryStore

  experimental?: boolean
  open?: boolean
  provider?: string
  sso?: string
  ssoProvider?: string
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
  const {output, telemetry} = options
  const previousToken = await getCliToken()
  const hasExistingToken = Boolean(previousToken)

  const trace = telemetry.trace(LoginTrace)
  trace.start()

  const provider = await getProvider({
    experimental: options.experimental,
    orgSlug: options.sso,
    specifiedProvider: options.provider,
    ssoProvider: options.ssoProvider,
  })

  trace.log({provider: provider?.name, step: 'selectProvider'})

  if (provider === undefined) {
    throw new Error('No authentication providers found')
  }

  const {loginUrl, server, token: tokenPromise} = await startServerForTokenCallback(provider.url)

  trace.log({step: 'waitForToken'})

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
    trace.error(err as Error)
    debug('Error retrieving token: %O', err)
    throw err
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }

  // Store the token
  setCliUserConfig('authToken', authToken)

  // Clear cached telemetry consent
  getUserConfig().delete('telemetryConsent')

  // If we had a session previously, attempt to clear it
  if (hasExistingToken) {
    await logout(previousToken).catch((err) => {
      const statusCode = err && err.response && err.response.statusCode
      if (statusCode !== 401) {
        output.warn('Failed to invalidate previous session')
      }
    })
  }

  trace.complete()
}
