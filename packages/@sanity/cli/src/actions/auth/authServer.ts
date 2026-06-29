import {createServer, type Server} from 'node:http'
import os from 'node:os'

import {subdebug} from '@sanity/cli-core/debug'
import {getSanityUrl} from '@sanity/cli-core/util'

import {getTokenDetails} from '../../services/auth.js'
import {type TokenDetails} from './types.js'

const debug = subdebug('auth')
const defaultCallbackPort = 4321
const callbackEndpoint = '/callback'

/**
 * Get the port to first attempt binding the auth callback server to.
 *
 * The auth backend accepts any `http://localhost:<port>` origin for token
 * callbacks, but we prefer a predictable port: it is friendlier for users who
 * need to allow or forward the port (e.g. logging in from a remote machine over
 * an SSH tunnel). If the preferred port is taken, we fall back to an
 * OS-assigned ephemeral port.
 *
 * The `SANITY_CLI_CALLBACK_PORT` environment variable overrides the preferred
 * port (`0` for an OS-assigned port). The override exists primarily for tests,
 * where OS-assigned ports prevent collisions between tests running in parallel.
 *
 * @returns Port number to attempt first
 * @internal
 */
function getPreferredCallbackPort(): number {
  const override = process.env.SANITY_CLI_CALLBACK_PORT
  if (!override) {
    return defaultCallbackPort
  }

  debug('Using callback port from SANITY_CLI_CALLBACK_PORT: %s', override)

  const port = Number.parseInt(override.trim(), 10)
  if (Number.isNaN(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid SANITY_CLI_CALLBACK_PORT value: "${override}"`)
  }

  return port
}

const platformNames: Record<string, string | undefined> = {
  aix: 'AIX',
  android: 'Android',
  darwin: 'MacOS',
  freebsd: 'FreeBSD',
  linux: 'Linux',
  openbsd: 'OpenBSD',
  sunos: 'SunOS',
  win32: 'Windows',
}

/**
 * Start a local HTTP server and wait for a request to the auth callback endpoint.
 * This happens by the user being sent to a login page with a callback URL that points to
 * this local server. This request includes a short-lived "SID" (session ID) that we then
 * do a request to the `/auth/fetch` endpoint with to get the actual auth token,
 * invalidating the SID in the process.
 *
 * If we fail to bind to the preferred port, we retry with an OS-assigned port.
 *
 * @param providerUrl - The URL of the login provider
 * @returns Resolves with HTTP server instance, a login URL to send user to, and a `token` promise
 * @internal
 */
export function startServerForTokenCallback(
  providerUrl: string,
): Promise<{loginUrl: URL; server: Server; token: Promise<TokenDetails>}> {
  const sanityUrl = getSanityUrl()

  // note: replace with `Promise.withResolvers()` when minimum Node.js is 22+
  let resolveToken: (resolvedToken: PromiseLike<TokenDetails> | TokenDetails) => void
  let rejectToken: (reason: Error) => void
  const tokenPromise = new Promise<TokenDetails>((resolve, reject) => {
    resolveToken = resolve
    rejectToken = reject
  })

  return new Promise((resolve, reject) => {
    let callbackPort = getPreferredCallbackPort()

    const server = createServer(async function onCallbackServerRequest(req, res) {
      function failLoginRequest(code = '') {
        res.writeHead(303, 'See Other', {
          Connection: 'close',
          Location: `${sanityUrl}/login/error${code ? `?error=${code}` : ''}`,
        })
        res.end()
        server.close()
      }

      const url = new URL(req.url || '/', `http://localhost:${callbackPort}`)
      if (url.pathname !== callbackEndpoint) {
        res.writeHead(404, 'Not Found', {Connection: 'close', 'Content-Type': 'text/plain'})
        res.write('404 Not Found')
        res.end()
        return
      }

      const absoluteTokenUrl = url.searchParams.get('url')
      if (!absoluteTokenUrl) {
        failLoginRequest()
        rejectToken(new Error('Missing callback URL'))
        return
      }

      const tokenUrl = new URL(absoluteTokenUrl)
      if (!tokenUrl.searchParams.has('sid')) {
        failLoginRequest('NO_SESSION_ID')
        rejectToken(new Error('Missing session ID in callback'))
        return
      }

      let token: TokenDetails
      try {
        token = await getTokenDetails(tokenUrl.search)
      } catch (err) {
        failLoginRequest('UNRESOLVED_SESSION')
        rejectToken(err instanceof Error ? err : new Error(`Unknown error: ${err}`))
        return
      }

      res.writeHead(303, 'See Other', {
        Connection: 'close',
        Location: `${sanityUrl}/login/success`,
      })
      res.end()
      server.close()
      resolveToken(token)
    })

    server.on('listening', function onCallbackListen() {
      // Once the server is successfully listening on a port, we can return the promise.
      // We'll then await the _token promise_, while the server is running in the background.
      const callbackUrl = getCallbackUrl(server)
      const loginUrl = getLoginUrl(providerUrl, callbackUrl)
      resolve({loginUrl, server, token: tokenPromise})
    })

    server.on('error', function onCallbackServerError(err) {
      // The auth backend accepts any localhost port in the callback origin, so if
      // the preferred port is busy we fall back to an OS-assigned ephemeral port.
      // Port 0 cannot itself be "in use" - an EADDRINUSE there means something is
      // genuinely wrong, so only fall back once.
      if ('code' in err && err.code === 'EADDRINUSE' && callbackPort !== 0) {
        debug('Port %d busy, falling back to OS-assigned port', callbackPort)
        callbackPort = 0
        server.listen(callbackPort)
      } else {
        reject(err)
      }
    })

    debug('Starting callback server on port %d', callbackPort)
    server.listen(callbackPort)
  })
}

/**
 * Get the login URL to send the user to for the given auth provider.
 *
 * The generated URL will include a label for the session that includes the
 * hostname and platform of the current computer, to help identify the session.
 *
 * @param providerUrl - The URL of the login provider
 * @param callbackUrl - The callback URL for the local auth token server
 * @returns The login URL
 * @internal
 */
function getLoginUrl(providerUrl: string, callbackUrl: URL): URL {
  // Build a login URL that redirects back back to OAuth flow on success
  const loginUrl = new URL(providerUrl)

  // Prefer `MacOS` over `darwin` etc
  const platformName = os.platform()
  const platform = platformName in platformNames ? platformNames[platformName] : platformName

  // Prefer `espens-macbook` over `espens-macbook.local`
  const hostname = os.hostname().replaceAll(/\.(local|lan)$/g, '')

  loginUrl.searchParams.set('type', 'token')
  loginUrl.searchParams.set('label', `${hostname} / ${platform}`)
  loginUrl.searchParams.set('origin', callbackUrl.href)

  return loginUrl
}

function getCallbackUrl(server: Server): URL {
  const serverUrl = server.address()
  if (!serverUrl || typeof serverUrl === 'string') {
    // Note: `serverUrl` is string only when binding to unix sockets,
    // thus we can safely assume Something Is Wrong™ if it's a string
    throw new Error('Failed to start auth callback server')
  }

  return new URL(callbackEndpoint, `http://localhost:${serverUrl.port}`)
}
