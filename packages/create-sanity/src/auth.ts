import {spawn} from 'node:child_process'
import {createServer, type Server} from 'node:http'
import os from 'node:os'

import {isAuthError, isStaging, request} from './api.js'
import {getToken, storeToken} from './config.js'
import {
  exitCodes,
  InitError,
  input,
  isInteractive,
  logSymbols,
  output,
  select,
  spinner,
} from './ui.js'

const USERS_API_VERSION = 'v2025-08-30'
const AUTH_API_VERSION = 'v2025-09-23'

export interface User {
  id: string
  name: string
  provider: string

  email?: string | null
}

interface LoginProvider {
  name: string
  title: string
  url: string
}

const LOGIN_PROVIDER_IDS = ['google', 'github', 'sanity', 'vercel'] as const

const LOGIN_REQUIRED_MESSAGE = [
  'No valid authentication credentials found.',
  '',
  'Authenticate with one of these commands:',
  '  echo "$TOKEN" | sanity login --with-token',
  '  sanity login --provider <providerId> --no-open',
  `    Provider IDs: ${LOGIN_PROVIDER_IDS.join(', ')}`,
  '  sanity login --sso <organizationSlug> --no-open',
  '',
  '`--no-open` prints a login URL instead of opening a browser.',
].join('\n')

function getCurrentUser(token?: string): Promise<User> {
  return request<User>({apiVersion: USERS_API_VERSION, token, url: '/users/me'})
}

/** The current user, or `null` when there is no valid token. Network errors are thrown. */
export async function validateSession(): Promise<User | null> {
  if (!getToken()) return null
  try {
    return await getCurrentUser()
  } catch (error) {
    if (isAuthError(error)) return null
    throw error
  }
}

export function getProviderName(provider: string): string {
  if (provider === 'google') return 'Google'
  if (provider === 'github') return 'GitHub'
  if (provider === 'sanity') return 'Email'
  if (provider === 'sanity-token') return 'an API token'
  if (provider.startsWith('saml-')) return 'SAML'
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}

export function getUserDisplayName(user: User): string {
  return user.email || user.name || user.id
}

function logLoggedIn(user: User): void {
  output.log(
    `${logSymbols.success} You are logged in as ${getUserDisplayName(user)} using ${getProviderName(user.provider)}`,
  )
}

/** Validate the session, logging in through the browser when needed */
export async function ensureAuthenticated(options: {
  provider?: string
  unattended: boolean
}): Promise<User> {
  const user = await validateSession()
  if (user) {
    logLoggedIn(user)
    return user
  }
  if (options.unattended) throw new InitError(LOGIN_REQUIRED_MESSAGE, exitCodes.RUNTIME_ERROR)

  output.warn(LOGIN_REQUIRED_MESSAGE)
  try {
    await login(options.provider)
  } catch (error) {
    throw new InitError(`Login failed: ${error instanceof Error ? error.message : error}`)
  }
  const loggedIn = await getCurrentUser()
  logLoggedIn(loggedIn)
  return loggedIn
}

async function getProvider(specified: string | undefined): Promise<LoginProvider | undefined> {
  const spin = spinner('Fetching providers...').start()
  let providers: LoginProvider[]
  try {
    ;({providers} = await request<{providers: LoginProvider[]}>({
      apiVersion: AUTH_API_VERSION,
      unauthenticated: true,
      url: '/auth/providers',
    }))
  } finally {
    spin.stop()
  }

  const realProviderNames = providers.filter((p) => p.name !== 'sso').map((p) => p.name)
  if (specified) {
    const provider = providers.find((candidate) => candidate.name === specified)
    if (!provider) {
      throw new Error(
        `Cannot find login provider with name "${specified}". ` +
          (realProviderNames.length > 0
            ? `Available providers: ${realProviderNames.join(', ')}`
            : 'No providers are available'),
      )
    }
    return provider
  }
  if (providers.length === 0) return undefined
  if (!isInteractive()) {
    if (realProviderNames.length === 1) {
      return providers.find((provider) => provider.name === realProviderNames[0])
    }
    throw new Error(
      `Multiple login providers available: ${realProviderNames.join(', ')}. ` +
        'Use `--provider <name>` to select one in unattended mode.',
    )
  }

  const choices = [...providers, {name: 'sso', title: 'SSO', url: '_not_used_'}]
  const provider = await select({
    choices: choices.map((choice) => ({name: choice.title, value: choice})),
    message: 'Please log in or create a new account',
  })
  if (provider.name !== 'sso') return provider

  const orgSlug = await input({message: 'Organization slug:'})
  const ssoProviders = await request<{disabled?: boolean; loginUrl: string; name: string}[]>({
    apiVersion: AUTH_API_VERSION,
    unauthenticated: true,
    url: `/auth/organizations/by-slug/${orgSlug}/providers`,
  })
  const enabled = ssoProviders.filter((candidate) => !candidate.disabled)
  if (enabled.length === 0) return undefined
  const saml =
    enabled.length === 1
      ? enabled[0]
      : await select({
          choices: enabled.map((candidate) => ({name: candidate.name, value: candidate})),
          message: 'Select SSO provider',
        })
  return {name: saml.name, title: saml.name, url: saml.loginUrl}
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

export function getLoginUrl(providerUrl: string, callbackUrl: URL): URL {
  const loginUrl = new URL(providerUrl)
  const platform = platformNames[os.platform()] ?? os.platform()
  const hostname = os.hostname().replaceAll(/\.(local|lan)$/g, '')
  loginUrl.searchParams.set('type', 'token')
  loginUrl.searchParams.set('label', `${hostname} / ${platform}`)
  loginUrl.searchParams.set('origin', callbackUrl.href)
  return loginUrl
}

/**
 * Serve the login callback locally. The callback carries a short-lived session
 * ID that is exchanged for a token through `/auth/fetch`.
 */
function startCallbackServer(
  providerUrl: string,
): Promise<{loginUrl: URL; server: Server; token: Promise<string>}> {
  const sanityUrl = isStaging() ? 'https://www.sanity.work' : 'https://www.sanity.io'
  const {
    promise: token,
    reject: rejectToken,
    resolve: resolveToken,
  } = Promise.withResolvers<string>()
  // Keep an unawaited rejection from crashing the process before the caller awaits it
  token.catch(() => {})
  const port = Number(process.env.SANITY_CLI_CALLBACK_PORT ?? 0) || 0

  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const redirect = (path: string) => {
        res.writeHead(303, 'See Other', {Connection: 'close', Location: `${sanityUrl}${path}`})
        res.end()
        server.close()
      }
      const url = new URL(req.url || '/', 'http://localhost')
      if (url.pathname !== '/callback') {
        res.writeHead(404, 'Not Found', {Connection: 'close', 'Content-Type': 'text/plain'})
        res.end('404 Not Found')
        return
      }
      const absoluteTokenUrl = url.searchParams.get('url')
      if (!absoluteTokenUrl) {
        redirect('/login/error')
        rejectToken(new Error('Missing callback URL'))
        return
      }
      const tokenUrl = new URL(absoluteTokenUrl)
      if (!tokenUrl.searchParams.has('sid')) {
        redirect('/login/error?error=NO_SESSION_ID')
        rejectToken(new Error('Missing session ID in callback'))
        return
      }
      try {
        const details = await request<{token: string}>({
          apiVersion: AUTH_API_VERSION,
          unauthenticated: true,
          url: `/auth/fetch${tokenUrl.search}`,
        })
        redirect('/login/success')
        resolveToken(details.token)
      } catch (error) {
        redirect('/login/error?error=UNRESOLVED_SESSION')
        rejectToken(error instanceof Error ? error : new Error(String(error)))
      }
    })
    server.on('error', reject)
    server.listen(port, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to start auth callback server'))
        return
      }
      const callbackUrl = new URL('/callback', `http://localhost:${address.port}`)
      resolve({loginUrl: getLoginUrl(providerUrl, callbackUrl), server, token})
    })
  })
}

function canLaunchBrowser(): boolean {
  if (['darwin', 'win32'].includes(os.platform())) return true
  return Boolean(process.env.XDG_CURRENT_DESKTOP || process.env.GDMSESSION)
}

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url.replaceAll('&', '^&')]]
        : ['xdg-open', [url]]
  try {
    const child = spawn(command, args, {detached: true, stdio: 'ignore'})
    child.on('error', () => {})
    child.unref()
  } catch {
    // The URL is printed, so the user can open it themselves
  }
}

async function login(specifiedProvider: string | undefined): Promise<void> {
  const provider = await getProvider(specifiedProvider)
  if (!provider) throw new Error('No authentication providers found')

  const {loginUrl, server, token} = await startCallbackServer(provider.url)
  const launch = canLaunchBrowser()
  output.log(`\n${launch ? 'Opening browser at' : 'Please open a browser at'} ${loginUrl.href}\n`)
  const spin = spinner('Waiting for browser login to complete... Press Ctrl + C to cancel').start()
  if (launch) openBrowser(loginUrl.href)
  try {
    storeToken(await token)
  } finally {
    spin.stop()
    server.close()
  }
}
