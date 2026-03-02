import {createServer, type Server} from 'node:http'
import os from 'node:os'

import {subdebug} from '@sanity/cli-core'
import {type SanityClient} from '@sanity/client'

const debug = subdebug('auth')
const callbackPorts = [4321, 4000, 3003, 1234, 8080, 13_333]
const callbackEndpoint = '/callback'

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
 * The response shape from /auth/fetch
 *
 * @internal
 */
interface TokenDetails {
  label: string
  token: string
}

/**
 * Start a local HTTP server and wait for a request to the auth callback endpoint.
 * This happens by the user being sent to a login page with a callback URL that points to
 * this local server. This request includes a short-lived "SID" (session ID) that we then
 * do a request to the `/auth/fetch` endpoint with to get the actual auth token,
 * invalidating the SID in the process.
 *
 * If we fail to bind to the first port, we retry with the next port in the list.
 *
 * @param options - Options for the server
 * @returns Resolves with HTTP server instance, a login URL, a callback URL, and a `token` promise
 * @internal
 */
export function startServerForTokenCallback(options: {
  client: SanityClient
  providerUrl: string
}): Promise<{callbackUrl: URL; loginUrl: URL; server: Server; token: Promise<TokenDetails>}> {
  const {client, providerUrl} = options
  const {apiHost} = client.config()
  const domain = apiHost.includes('.sanity.work') ? 'www.sanity.work' : 'www.sanity.io'

  const attemptPorts = [...callbackPorts]
  let callbackPort = attemptPorts.shift()

  // note: replace with `Promise.withResolvers()` when minimum Node.js is 22+
  let resolveToken: (resolvedToken: PromiseLike<TokenDetails> | TokenDetails) => void
  let rejectToken: (reason: Error) => void
  const tokenPromise = new Promise<TokenDetails>((resolve, reject) => {
    resolveToken = resolve
    rejectToken = reject
  })

  return new Promise((resolve, reject) => {
    const server = createServer(async function onCallbackServerRequest(req, res) {
      function failLoginRequest(code = '') {
        res.writeHead(303, 'See Other', {
          Location: `https://${domain}/login/error${code ? `?error=${code}` : ''}`,
        })
        res.end()
        server.close()
      }

      const url = new URL(req.url || '/', `http://localhost:${callbackPort}`)
      if (url.pathname !== callbackEndpoint) {
        res.writeHead(404, 'Not Found', {'Content-Type': 'text/plain'})
        res.write('404 Not Found')
        res.end()
        return
      }

      const absoluteTokenUrl = url.searchParams.get('url')
      if (!absoluteTokenUrl) {
        failLoginRequest()
        return
      }

      const tokenUrl = new URL(absoluteTokenUrl)
      if (!tokenUrl.searchParams.has('sid')) {
        failLoginRequest('NO_SESSION_ID')
        return
      }

      let token: TokenDetails
      try {
        token = await client.request({uri: `/auth/fetch${tokenUrl.search}`})
      } catch (err) {
        failLoginRequest('UNRESOLVED_SESSION')
        rejectToken(err instanceof Error ? err : new Error(`Unknown error: ${err}`))
        return
      }

      res.writeHead(303, 'See Other', {Location: `https://${domain}/login/success`})
      res.end()
      server.close()
      resolveToken(token)
    })

    server.on('listening', function onCallbackListen() {
      // Once the server is successfully listening on a port, we can return the promise.
      // We'll then await the _token promise_, while the server is running in the background.
      const callbackUrl = getCallbackUrl(server)
      const loginUrl = getLoginUrl(providerUrl, callbackUrl)
      resolve({callbackUrl, loginUrl, server, token: tokenPromise})
    })

    server.on('error', function onCallbackServerError(err) {
      if ('code' in err && err.code === 'EADDRINUSE') {
        callbackPort = attemptPorts.shift()
        if (!callbackPort) {
          reject(new Error('Failed to find port number to bind auth callback server to'))
          return
        }

        debug('Port busy, trying %d', callbackPort)
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
