import http from 'node:http'
import {Readable} from 'node:stream'

import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import open from 'open'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {startServerForTokenCallback} from '../../actions/auth/authServer.js'
import {AUTH_API_VERSION} from '../../services/auth.js'
import {USERS_API_VERSION} from '../../services/user.js'
import {canLaunchBrowser} from '../../util/canLaunchBrowser.js'
import {LoginCommand} from '../login.js'

// Hoisted mocks for user prompts
const mockInput = vi.hoisted(() => vi.fn())
const mockSelect = vi.hoisted(() => vi.fn())
const mockedGetCliToken = vi.hoisted(() => vi.fn())
const mockedSetCliUserConfig = vi.hoisted(() => vi.fn())
const mockedIsInteractive = vi.hoisted(() => vi.fn().mockReturnValue(true))

// Mock user interaction prompts
vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    input: mockInput,
    select: mockSelect,
  }
})

// Mock browser launching
vi.mock('open')

// Mock platform detection
vi.mock('../../util/canLaunchBrowser.js', () => ({
  canLaunchBrowser: vi.fn().mockReturnValue(true),
}))

// Wrap the real callback server so tests can await its startup and read the
// port it actually bound.
vi.mock('../../actions/auth/authServer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../actions/auth/authServer.js')>()
  return {
    ...actual,
    startServerForTokenCallback: vi.fn(actual.startServerForTokenCallback),
  }
})

const mockConfigStoreDelete = vi.hoisted(() => vi.fn())

// Mock CLI core functions with real test client for HTTP
vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')

  return {
    ...actual,
    getCliToken: mockedGetCliToken,
    getGlobalCliClient: vi
      .fn()
      .mockImplementation((options: {apiVersion: string; token?: string}) => {
        const {client} = createTestClient({
          apiVersion: options.apiVersion,
          token: options.token,
        })

        return Promise.resolve(client)
      }),
    getUserConfig: vi.fn().mockReturnValue({
      delete: mockConfigStoreDelete,
      get: vi.fn(),
      set: vi.fn(),
    }),
    isInteractive: mockedIsInteractive,
    setCliUserConfig: mockedSetCliUserConfig,
  }
})

const mockedOpen = vi.mocked(open)
const mockedCanLaunchBrowser = vi.mocked(canLaunchBrowser)
const mockedStartServerForTokenCallback = vi.mocked(startServerForTokenCallback)
const originalStdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin')
type MockStdin = Readable & {isTTY?: boolean}

function mockStdin(input: string, options: {isTTY?: boolean} = {}) {
  const stdin: MockStdin = Readable.from([input])
  stdin.isTTY = options.isTTY

  Object.defineProperty(process, 'stdin', {
    configurable: true,
    value: stdin,
  })
}

/**
 * Waits until the login command's local callback server is listening, and
 * returns the callback URL it actually bound. The port can differ from 4321
 * when the server falls back to another port.
 *
 * Rejects with the command's error if it exits before the server starts.
 */
async function waitForCallbackUrl(commandPromise: Promise<{error?: Error}>): Promise<URL> {
  const commandExit = commandPromise.then(({error}) => {
    throw error ?? new Error('Login command exited before the callback server started')
  })

  const startup = await Promise.race([
    vi.waitFor(() => {
      const [result] = mockedStartServerForTokenCallback.mock.settledResults
      if (!result || result.type === 'incomplete') {
        throw new Error('Callback server has not started yet')
      }
      return result
    }, 9000),
    commandExit,
  ])

  if (startup.type === 'rejected') throw startup.value
  return new URL(startup.value.loginUrl.searchParams.get('origin')!)
}

/**
 * Simulates the OAuth provider redirecting back to the local callback server.
 * Waits for the server to be listening, then makes an actual HTTP request to it.
 */
async function simulateOAuthCallback(
  commandPromise: Promise<{error?: Error}>,
  sessionId: string,
): Promise<number> {
  const callbackUrl = await waitForCallbackUrl(commandPromise)
  const url = `${callbackUrl.href}?url=${encodeURIComponent(
    `https://api.sanity.io/auth/fetch?sid=${sessionId}`,
  )}`

  return httpGetStatus(url)
}

function httpGetStatus(url: string | URL): Promise<number> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        res.resume() // Consume response
        resolve(res.statusCode || 0)
      })
      .on('error', reject)
  })
}

/**
 * Bind an HTTP server to an OS-assigned port, to deliberately occupy it.
 * Used with the `SANITY_CLI_CALLBACK_PORT` override to exercise the login
 * command's port fallback behavior without hardcoding port numbers.
 */
async function startBlockingServer(): Promise<{close: () => Promise<void>; port: number}> {
  const server = http.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind blocking server')
  }

  return {
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      }),
    port: address.port,
  }
}

/**
 * Helper to set up the standard provider + token exchange mocks for a single-provider happy path.
 */
function mockSingleProviderLogin(sessionId = 'test-session-id') {
  mockApi({
    apiVersion: AUTH_API_VERSION,
    method: 'get',
    uri: '/auth/providers',
  }).reply(200, {
    providers: [{name: 'google', title: 'Google', url: 'https://api.sanity.io/auth/google'}],
  })

  mockApi({
    apiVersion: AUTH_API_VERSION,
    method: 'get',
    query: {sid: sessionId},
    uri: '/auth/fetch',
  }).reply(200, {label: 'Test Session', token: 'new-auth-token'})
}

function testTokenLogin(token: string) {
  mockStdin(token)
  return testCommand(LoginCommand, ['--with-token'])
}

describe('#login', {timeout: 10_000}, () => {
  afterEach(() => {
    if (originalStdinDescriptor) {
      Object.defineProperty(process, 'stdin', originalStdinDescriptor)
    }
    // Close any callback server still listening so it can't swallow the next
    // test's callbacks or API mocks.
    for (const startup of mockedStartServerForTokenCallback.mock.settledResults) {
      if (startup.type === 'fulfilled') startup.value.server.close()
    }
    vi.unstubAllEnvs()
    vi.clearAllMocks()
    mockedIsInteractive.mockReturnValue(true)
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  describe('Token Login', () => {
    test('stores a valid token', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: USERS_API_VERSION,
        method: 'get',
        uri: '/users/me',
      })
        .matchHeader('authorization', 'Bearer valid-token')
        .reply(200, {
          email: 'test@example.com',
          id: 'user-123',
          name: 'Test User',
          provider: 'github',
        })

      const {error, stdout} = await testTokenLogin(' valid-token\n')

      if (error) throw error
      expect(stdout).toContain('Login successful')
      expect(mockedSetCliUserConfig).toHaveBeenCalledWith('authToken', 'valid-token')
      expect(mockConfigStoreDelete).toHaveBeenCalledWith('telemetryConsent')
      expect(mockedOpen).not.toHaveBeenCalled()
      expect(mockSelect).not.toHaveBeenCalled()
    })

    test('stores a valid token in non-interactive mode', async () => {
      mockedIsInteractive.mockReturnValue(false)
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: USERS_API_VERSION,
        method: 'get',
        uri: '/users/me',
      })
        .matchHeader('authorization', 'Bearer non-interactive-token')
        .reply(200, {
          email: 'test@example.com',
          id: 'user-123',
          name: 'Test User',
          provider: 'github',
        })

      const {error, stdout} = await testTokenLogin('non-interactive-token')

      if (error) throw error
      expect(stdout).toContain('Login successful')
      expect(mockedSetCliUserConfig).toHaveBeenCalledWith('authToken', 'non-interactive-token')
      expect(mockConfigStoreDelete).toHaveBeenCalledWith('telemetryConsent')
      expect(mockedOpen).not.toHaveBeenCalled()
      expect(mockInput).not.toHaveBeenCalled()
      expect(mockSelect).not.toHaveBeenCalled()
    })

    test('does not store an invalid token', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: USERS_API_VERSION,
        method: 'get',
        uri: '/users/me',
      })
        .matchHeader('authorization', 'Bearer invalid-token')
        .reply(401, {message: 'Unauthorized'})

      const {error} = await testTokenLogin('invalid-token')

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Token is invalid or expired')
      expect(error?.oclif?.exit).toBe(1)
      expect(mockedSetCliUserConfig).not.toHaveBeenCalled()
      expect(mockConfigStoreDelete).not.toHaveBeenCalled()
      expect(mockedOpen).not.toHaveBeenCalled()
    })

    test('does not store a token that cannot be verified', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: USERS_API_VERSION,
        method: 'get',
        uri: '/users/me',
      }).reply(500, {message: 'Internal Server Error'})

      const {error} = await testTokenLogin('server-error-token')

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Could not verify token')
      expect(error?.message).toContain('Internal Server Error')
      expect(error?.oclif?.exit).toBe(1)
      expect(mockedSetCliUserConfig).not.toHaveBeenCalled()
      expect(mockConfigStoreDelete).not.toHaveBeenCalled()
      expect(mockedOpen).not.toHaveBeenCalled()
    })

    test('stores a valid Sanity API token', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: USERS_API_VERSION,
        method: 'get',
        uri: '/users/me',
      })
        .matchHeader('authorization', 'Bearer robot-token')
        .reply(200, {
          id: 'robot-123',
          name: 'Deploy Token',
          provider: 'sanity-token',
        })

      const {error, stdout} = await testTokenLogin('robot-token')

      if (error) throw error
      expect(stdout).toContain('Login successful')
      expect(mockedSetCliUserConfig).toHaveBeenCalledWith('authToken', 'robot-token')
      expect(mockConfigStoreDelete).toHaveBeenCalledWith('telemetryConsent')
      expect(mockedOpen).not.toHaveBeenCalled()
    })

    test('requires a non-empty token', async () => {
      mockedGetCliToken.mockResolvedValue('')

      const {error} = await testTokenLogin('  \n')

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain(
        'Token is required on standard input. Run `sanity login --with-token < token.txt`.',
      )
      expect(error?.oclif?.exit).toBe(1)
      expect(mockedSetCliUserConfig).not.toHaveBeenCalled()
    })

    test('requires token input from stdin', async () => {
      mockedGetCliToken.mockResolvedValue('')
      mockStdin('', {isTTY: true})

      const {error} = await testCommand(LoginCommand, ['--with-token'])

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain(
        'Token is required on standard input. Run `sanity login --with-token < token.txt`.',
      )
      expect(error?.oclif?.exit).toBe(1)
      expect(mockedSetCliUserConfig).not.toHaveBeenCalled()
      expect(mockedOpen).not.toHaveBeenCalled()
    })

    test('invalidates an existing session after token login', async () => {
      mockedGetCliToken.mockResolvedValue('old-auth-token')

      mockApi({
        apiVersion: USERS_API_VERSION,
        method: 'get',
        uri: '/users/me',
      })
        .matchHeader('authorization', 'Bearer new-auth-token')
        .reply(200, {
          email: 'test@example.com',
          id: 'user-123',
          name: 'Test User',
          provider: 'github',
        })

      mockApi({
        apiVersion: USERS_API_VERSION,
        method: 'get',
        uri: '/users/me',
      })
        .matchHeader('authorization', 'Bearer old-auth-token')
        .reply(200, {
          email: 'old@example.com',
          id: 'old-user-123',
          name: 'Old User',
          provider: 'github',
        })

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'post',
        uri: '/auth/logout',
      })
        .matchHeader('authorization', 'Bearer old-auth-token')
        .reply(200)

      const {error} = await testTokenLogin('new-auth-token')

      if (error) throw error
      expect(mockedSetCliUserConfig).toHaveBeenCalledWith('authToken', 'new-auth-token')
    })

    test('does not invalidate an existing Sanity API token after token login', async () => {
      mockedGetCliToken.mockResolvedValue('old-api-token')

      mockApi({
        apiVersion: USERS_API_VERSION,
        method: 'get',
        uri: '/users/me',
      })
        .matchHeader('authorization', 'Bearer new-auth-token')
        .reply(200, {
          email: 'test@example.com',
          id: 'user-123',
          name: 'Test User',
          provider: 'github',
        })

      mockApi({
        apiVersion: USERS_API_VERSION,
        method: 'get',
        uri: '/users/me',
      })
        .matchHeader('authorization', 'Bearer old-api-token')
        .reply(200, {
          id: 'robot-123',
          name: 'Deploy Token',
          provider: 'sanity-token',
        })

      const {error, stderr} = await testTokenLogin('new-auth-token')

      if (error) throw error
      expect(stderr).not.toContain('Failed to invalidate previous session')
      expect(mockedSetCliUserConfig).toHaveBeenCalledWith('authToken', 'new-auth-token')
    })

    test('does not invalidate an unchanged token after token login', async () => {
      mockedGetCliToken.mockResolvedValue('same-token')

      mockApi({
        apiVersion: USERS_API_VERSION,
        method: 'get',
        uri: '/users/me',
      })
        .matchHeader('authorization', 'Bearer same-token')
        .reply(200, {
          email: 'test@example.com',
          id: 'user-123',
          name: 'Test User',
          provider: 'github',
        })

      const {error, stderr} = await testTokenLogin('same-token')

      if (error) throw error
      expect(stderr).not.toContain('Failed to invalidate previous session')
      expect(mockedSetCliUserConfig).toHaveBeenCalledWith('authToken', 'same-token')
    })
  })

  describe('Provider Selection', () => {
    // Error/early-exit tests first (no auth server started, so no port conflicts)

    test('errors when --provider and --sso are both specified', async () => {
      const {error} = await testCommand(LoginCommand, ['--provider', 'github', '--sso', 'my-org'])

      expect(error).toBeDefined()
      expect(error?.message).toContain('--provider=github cannot also be provided when using --sso')
    })

    test('errors when --provider and --with-token are both specified', async () => {
      mockStdin('token')

      const {error} = await testCommand(LoginCommand, ['--provider', 'github', '--with-token'])

      expect(error).toBeDefined()
      expect(error?.message).toContain('--provider=github cannot also be provided')
    })

    test('throws error for invalid --provider flag', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/providers',
      }).reply(200, {
        providers: [
          {name: 'google', title: 'Google', url: 'https://api.sanity.io/auth/google'},
          {name: 'github', title: 'GitHub', url: 'https://api.sanity.io/auth/github'},
        ],
      })

      const {error} = await testCommand(LoginCommand, ['--provider', 'invalid-provider'])

      expect(error).toBeDefined()
      expect(error?.message).toContain('Cannot find login provider with name "invalid-provider"')
      expect(error?.message).toContain('Available providers: google, github')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('throws error when no providers are available', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/providers',
      }).reply(200, {providers: []})

      const {error} = await testCommand(LoginCommand, [])

      expect(error).toBeDefined()
      expect(error?.message).toContain('No authentication providers found')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('handles provider API error gracefully', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/providers',
      }).reply(500, {message: 'Internal Server Error'})

      const {error} = await testCommand(LoginCommand, [])

      expect(error).toBeDefined()
      expect(error?.message).toContain('Internal Server Error')
      expect(error?.oclif?.exit).toBe(1)
    })

    // Full-flow tests

    test('logs in successfully with single provider', async () => {
      mockedGetCliToken.mockResolvedValue('')
      mockSingleProviderLogin()

      const commandPromise = testCommand(LoginCommand, [])
      const statusCode = await simulateOAuthCallback(commandPromise, 'test-session-id')
      const {error, stdout} = await commandPromise

      expect(error).toBeUndefined()
      expect(stdout).toContain('Login successful')

      // Callback returns 303 redirect
      expect(statusCode).toBe(303)

      // Browser opened with provider URL
      expect(mockedOpen).toHaveBeenCalledWith(expect.stringContaining('auth/google'))

      // Token stored, telemetry cleared via config store
      expect(mockedSetCliUserConfig).toHaveBeenCalledTimes(1)
      expect(mockedSetCliUserConfig.mock.calls[0]).toEqual(['authToken', 'new-auth-token'])
      expect(mockConfigStoreDelete).toHaveBeenCalledWith('telemetryConsent')
    })

    test('prompts user to select from multiple providers', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/providers',
      }).reply(200, {
        providers: [
          {name: 'google', title: 'Google', url: 'https://api.sanity.io/auth/google'},
          {name: 'github', title: 'GitHub', url: 'https://api.sanity.io/auth/github'},
          {name: 'microsoft', title: 'Microsoft', url: 'https://api.sanity.io/auth/microsoft'},
        ],
      })

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        query: {sid: 'test-session-id'},
        uri: '/auth/fetch',
      }).reply(200, {label: 'Test Session', token: 'new-auth-token'})

      // User selects GitHub
      mockSelect.mockResolvedValue({
        name: 'github',
        title: 'GitHub',
        url: 'https://api.sanity.io/auth/github',
      })

      const commandPromise = testCommand(LoginCommand, [])
      await simulateOAuthCallback(commandPromise, 'test-session-id')
      const {error, stdout} = await commandPromise

      expect(error).toBeUndefined()
      expect(stdout).toContain('Login successful')
      expect(mockSelect).toHaveBeenCalledWith({
        choices: [
          {name: 'Google', value: expect.objectContaining({name: 'google'})},
          {name: 'GitHub', value: expect.objectContaining({name: 'github'})},
          {name: 'Microsoft', value: expect.objectContaining({name: 'microsoft'})},
        ],
        message: 'Please log in or create a new account',
      })
      expect(mockedOpen).toHaveBeenCalledWith(expect.stringContaining('auth/github'))
    })

    test('uses --provider flag to select specific provider', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/providers',
      }).reply(200, {
        providers: [
          {name: 'google', title: 'Google', url: 'https://api.sanity.io/auth/google'},
          {name: 'github', title: 'GitHub', url: 'https://api.sanity.io/auth/github'},
        ],
      })

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        query: {sid: 'test-session-id'},
        uri: '/auth/fetch',
      }).reply(200, {label: 'Test Session', token: 'new-auth-token'})

      const commandPromise = testCommand(LoginCommand, ['--provider', 'github'])
      await simulateOAuthCallback(commandPromise, 'test-session-id')
      const {error, stdout} = await commandPromise

      expect(error).toBeUndefined()
      expect(stdout).toContain('Login successful')
      expect(mockSelect).not.toHaveBeenCalled()
      expect(mockedOpen).toHaveBeenCalledWith(expect.stringContaining('auth/github'))
    })

    test('includes experimental SSO provider when --experimental flag is set', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/providers',
      }).reply(200, {
        providers: [{name: 'google', title: 'Google', url: 'https://api.sanity.io/auth/google'}],
      })

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/organizations/by-slug/test-org/providers',
      }).reply(200, [
        {
          callbackUrl: 'https://api.sanity.io/auth/saml/callback',
          disabled: false,
          id: 'sso-provider-1',
          loginUrl: 'https://api.sanity.io/auth/saml/login/sso-provider-1',
          name: 'My SSO',
          organizationId: 'org-123',
          type: 'saml' as const,
        },
      ])

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        query: {sid: 'test-session-id'},
        uri: '/auth/fetch',
      }).reply(200, {label: 'Test Session', token: 'new-auth-token'})

      // User selects SSO, then enters org slug
      mockSelect.mockResolvedValue({name: 'sso', title: 'SSO', url: '_not_used_'})
      mockInput.mockResolvedValue('test-org')

      const commandPromise = testCommand(LoginCommand, ['--experimental'])
      await simulateOAuthCallback(commandPromise, 'test-session-id')
      const {error, stdout} = await commandPromise

      expect(error).toBeUndefined()
      expect(stdout).toContain('Login successful')
      expect(mockSelect).toHaveBeenCalledWith({
        choices: [
          {name: 'Google', value: expect.objectContaining({name: 'google'})},
          {name: 'SSO', value: expect.objectContaining({name: 'sso'})},
        ],
        message: 'Please log in or create a new account',
      })
      expect(mockInput).toHaveBeenCalledWith({message: 'Organization slug:'})
      expect(mockedOpen).toHaveBeenCalledWith(expect.stringContaining('saml/login/sso-provider-1'))
    })
  })

  describe('SSO Flows', () => {
    // Error/early-exit tests first

    test('handles SSO error cases', async () => {
      mockedGetCliToken.mockResolvedValue('')

      // No enabled SSO providers
      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/organizations/by-slug/no-sso-org/providers',
      }).reply(200, [
        {
          callbackUrl: 'https://api.sanity.io/auth/saml/callback',
          disabled: true,
          id: 'sso-provider-1',
          loginUrl: 'https://api.sanity.io/auth/saml/login/sso-provider-1',
          name: 'Disabled SSO',
          organizationId: 'org-123',
          type: 'saml' as const,
        },
      ])

      const noProviders = await testCommand(LoginCommand, ['--sso', 'no-sso-org'])
      expect(noProviders.error).toBeDefined()
      expect(noProviders.error?.message).toContain('No authentication providers found')
      expect(noProviders.error?.oclif?.exit).toBe(1)
    })

    test('throws error for invalid organization slug', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/organizations/by-slug/invalid-org/providers',
      }).reply(404, {message: 'Organization not found'})

      const {error} = await testCommand(LoginCommand, ['--sso', 'invalid-org'])

      expect(error).toBeDefined()
      expect(error?.message).toContain('Organization not found')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('handles SSO provider API error', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/organizations/by-slug/my-org/providers',
      }).reply(500, {message: 'Internal Server Error'})

      const {error} = await testCommand(LoginCommand, ['--sso', 'my-org'])

      expect(error).toBeDefined()
      expect(error?.message).toContain('Internal Server Error')
      expect(error?.oclif?.exit).toBe(1)
    })

    // Full-flow tests

    test('logs in with --sso flag and single SSO provider', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/organizations/by-slug/my-org/providers',
      }).reply(200, [
        {
          callbackUrl: 'https://api.sanity.io/auth/saml/callback',
          disabled: false,
          id: 'sso-provider-1',
          loginUrl: 'https://api.sanity.io/auth/saml/login/sso-provider-1',
          name: 'Okta SSO',
          organizationId: 'org-123',
          type: 'saml' as const,
        },
      ])

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        query: {sid: 'test-session-id'},
        uri: '/auth/fetch',
      }).reply(200, {label: 'Test Session', token: 'new-auth-token'})

      const commandPromise = testCommand(LoginCommand, ['--sso', 'my-org'])
      await simulateOAuthCallback(commandPromise, 'test-session-id')
      const {error, stdout} = await commandPromise

      expect(error).toBeUndefined()
      expect(stdout).toContain('Login successful')
      expect(mockedOpen).toHaveBeenCalledWith(expect.stringContaining('saml/login/sso-provider-1'))
    })

    test('prompts user to select from multiple SSO providers', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/organizations/by-slug/my-org/providers',
      }).reply(200, [
        {
          callbackUrl: 'https://api.sanity.io/auth/saml/callback',
          disabled: false,
          id: 'sso-provider-1',
          loginUrl: 'https://api.sanity.io/auth/saml/login/sso-provider-1',
          name: 'Okta SSO',
          organizationId: 'org-123',
          type: 'saml' as const,
        },
        {
          callbackUrl: 'https://api.sanity.io/auth/saml/callback',
          disabled: false,
          id: 'sso-provider-2',
          loginUrl: 'https://api.sanity.io/auth/saml/login/sso-provider-2',
          name: 'Azure AD',
          organizationId: 'org-123',
          type: 'saml' as const,
        },
      ])

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        query: {sid: 'test-session-id'},
        uri: '/auth/fetch',
      }).reply(200, {label: 'Test Session', token: 'new-auth-token'})

      // User selects Azure AD
      mockSelect.mockResolvedValue({
        callbackUrl: 'https://api.sanity.io/auth/saml/callback',
        disabled: false,
        id: 'sso-provider-2',
        loginUrl: 'https://api.sanity.io/auth/saml/login/sso-provider-2',
        name: 'Azure AD',
        organizationId: 'org-123',
        type: 'saml' as const,
      })

      const commandPromise = testCommand(LoginCommand, ['--sso', 'my-org'])
      await simulateOAuthCallback(commandPromise, 'test-session-id')
      const {error, stdout} = await commandPromise

      expect(error).toBeUndefined()
      expect(stdout).toContain('Login successful')
      expect(mockSelect).toHaveBeenCalledWith({
        choices: [
          {name: 'Okta SSO', value: expect.objectContaining({id: 'sso-provider-1'})},
          {name: 'Azure AD', value: expect.objectContaining({id: 'sso-provider-2'})},
        ],
        message: 'Select SSO provider',
      })
      expect(mockedOpen).toHaveBeenCalledWith(expect.stringContaining('saml/login/sso-provider-2'))
    })

    test('filters out disabled SSO providers', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/organizations/by-slug/my-org/providers',
      }).reply(200, [
        {
          callbackUrl: 'https://api.sanity.io/auth/saml/callback',
          disabled: false,
          id: 'sso-provider-1',
          loginUrl: 'https://api.sanity.io/auth/saml/login/sso-provider-1',
          name: 'Okta SSO',
          organizationId: 'org-123',
          type: 'saml' as const,
        },
        {
          callbackUrl: 'https://api.sanity.io/auth/saml/callback',
          disabled: true,
          id: 'sso-provider-2',
          loginUrl: 'https://api.sanity.io/auth/saml/login/sso-provider-2',
          name: 'Disabled SSO',
          organizationId: 'org-123',
          type: 'saml' as const,
        },
      ])

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        query: {sid: 'test-session-id'},
        uri: '/auth/fetch',
      }).reply(200, {label: 'Test Session', token: 'new-auth-token'})

      const commandPromise = testCommand(LoginCommand, ['--sso', 'my-org'])
      await simulateOAuthCallback(commandPromise, 'test-session-id')
      const {error, stdout} = await commandPromise

      expect(error).toBeUndefined()
      expect(stdout).toContain('Login successful')
      // Should not prompt since only one enabled provider
      expect(mockSelect).not.toHaveBeenCalled()
      expect(mockedOpen).toHaveBeenCalledWith(expect.stringContaining('saml/login/sso-provider-1'))
    })
  })

  describe('Browser Integration', () => {
    test('opens browser and validates login URL format', async () => {
      mockedGetCliToken.mockResolvedValue('')
      mockedCanLaunchBrowser.mockReturnValue(true)
      mockSingleProviderLogin()

      const commandPromise = testCommand(LoginCommand, [])
      await simulateOAuthCallback(commandPromise, 'test-session-id')
      const {error, stdout} = await commandPromise

      expect(error).toBeUndefined()
      expect(stdout).toContain('Opening browser at')
      expect(mockedOpen).toHaveBeenCalledOnce()

      // Validate URL format
      const loginUrl = mockedOpen.mock.calls[0][0] as string
      const url = new URL(loginUrl)
      expect(url.searchParams.get('type')).toBe('token')
      expect(url.searchParams.get('label')).toBeTruthy()
      expect(url.searchParams.get('origin')).toContain('http://localhost:')
      expect(url.searchParams.get('origin')).toContain('/callback')
    })

    test('does not open browser when --no-open flag is set', async () => {
      mockedGetCliToken.mockResolvedValue('')
      mockedCanLaunchBrowser.mockReturnValue(true)
      mockSingleProviderLogin()

      const commandPromise = testCommand(LoginCommand, ['--no-open'])
      await simulateOAuthCallback(commandPromise, 'test-session-id')
      const {error, stdout} = await commandPromise

      expect(error).toBeUndefined()
      expect(stdout).toContain('Please open a browser at')
      expect(mockedOpen).not.toHaveBeenCalled()
    })

    test('does not open browser when canLaunchBrowser returns false', async () => {
      mockedGetCliToken.mockResolvedValue('')
      mockedCanLaunchBrowser.mockReturnValue(false)
      mockSingleProviderLogin()

      const commandPromise = testCommand(LoginCommand, [])
      await simulateOAuthCallback(commandPromise, 'test-session-id')
      const {error, stdout} = await commandPromise

      expect(error).toBeUndefined()
      expect(stdout).toContain('Please open a browser at')
      expect(mockedOpen).not.toHaveBeenCalled()
    })
  })

  describe('Auth Server and Token Exchange', () => {
    test('falls back to an OS-assigned port when the preferred port is busy', async () => {
      mockedGetCliToken.mockResolvedValue('')
      mockedCanLaunchBrowser.mockReturnValue(true)

      mockSingleProviderLogin()

      // Occupy a port, and configure the login command to prefer it
      const blocker = await startBlockingServer()
      vi.stubEnv('SANITY_CLI_CALLBACK_PORT', `${blocker.port}`)

      try {
        const commandPromise = testCommand(LoginCommand, [])
        const callbackUrl = await waitForCallbackUrl(commandPromise)
        expect(Number(callbackUrl.port)).not.toBe(blocker.port)

        await simulateOAuthCallback(commandPromise, 'test-session-id')
        const {error} = await commandPromise

        expect(error).toBeUndefined()

        // Verify login URL uses fallback port
        const loginUrl = new URL(mockedOpen.mock.calls[0][0] as string)
        expect(loginUrl.searchParams.get('origin')).toBe(callbackUrl.href)
      } finally {
        await blocker.close()
      }
    }, 10_000)

    test('handles malformed callback parameters', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/providers',
      }).reply(200, {
        providers: [{name: 'google', title: 'Google', url: 'https://api.sanity.io/auth/google'}],
      })

      const commandPromise = testCommand(LoginCommand, [])

      const callbackUrl = await waitForCallbackUrl(commandPromise)

      // Missing url parameter
      const missingUrlStatus = await httpGetStatus(callbackUrl)

      // Should get 303 redirect to error page
      expect(missingUrlStatus).toBe(303)

      const {error} = await commandPromise
      expect(error).toBeDefined()
      expect(error?.message).toContain('Login failed')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('handles missing sid in token URL', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/providers',
      }).reply(200, {
        providers: [{name: 'google', title: 'Google', url: 'https://api.sanity.io/auth/google'}],
      })

      const commandPromise = testCommand(LoginCommand, [])

      const callbackUrl = await waitForCallbackUrl(commandPromise)

      // URL present but no sid parameter
      const missingSidStatus = await httpGetStatus(
        `${callbackUrl.href}?url=${encodeURIComponent('https://api.sanity.io/auth/fetch')}`,
      )

      expect(missingSidStatus).toBe(303)

      const {error} = await commandPromise
      expect(error).toBeDefined()
      expect(error?.message).toContain('Login failed')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('handles token exchange failures', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/providers',
      }).reply(200, {
        providers: [{name: 'google', title: 'Google', url: 'https://api.sanity.io/auth/google'}],
      })

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        query: {sid: 'bad-session'},
        uri: '/auth/fetch',
      }).reply(400, {message: 'Invalid session ID'})

      const commandPromise = testCommand(LoginCommand, [])
      await simulateOAuthCallback(commandPromise, 'bad-session')
      const {error} = await commandPromise

      expect(error).toBeDefined()
      expect(error?.message).toContain('Login failed')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('returns 404 for non-callback endpoints', async () => {
      mockedGetCliToken.mockResolvedValue('')
      mockSingleProviderLogin()

      const commandPromise = testCommand(LoginCommand, [])

      const callbackUrl = await waitForCallbackUrl(commandPromise)

      // Make request to non-callback endpoint
      const statusCode = await httpGetStatus(new URL('/other', callbackUrl))

      expect(statusCode).toBe(404)

      // Complete the login
      await simulateOAuthCallback(commandPromise, 'test-session-id')
      const {error} = await commandPromise
      expect(error).toBeUndefined()
    })
  })

  describe('Session Management', () => {
    test('invalidates existing session on new login', async () => {
      mockedGetCliToken.mockResolvedValue('old-auth-token')
      mockSingleProviderLogin()

      mockApi({
        apiVersion: USERS_API_VERSION,
        method: 'get',
        uri: '/users/me',
      })
        .matchHeader('authorization', 'Bearer old-auth-token')
        .reply(200, {
          email: 'old@example.com',
          id: 'old-user-123',
          name: 'Old User',
          provider: 'github',
        })

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'post',
        uri: '/auth/logout',
      })
        .matchHeader('authorization', 'Bearer old-auth-token')
        .reply(200)

      const commandPromise = testCommand(LoginCommand, [])
      await simulateOAuthCallback(commandPromise, 'test-session-id')
      const {error} = await commandPromise

      expect(error).toBeUndefined()
      expect(mockedSetCliUserConfig).toHaveBeenCalledWith('authToken', 'new-auth-token')
    })

    test('clears an expired previous token without invalidating it', async () => {
      mockedGetCliToken.mockResolvedValue('expired-token')
      mockSingleProviderLogin('session-401')

      mockApi({
        apiVersion: USERS_API_VERSION,
        method: 'get',
        uri: '/users/me',
      }).reply(401, {message: 'Unauthorized'})

      const commandPromise = testCommand(LoginCommand, [])
      await simulateOAuthCallback(commandPromise, 'session-401')
      const {error, stderr} = await commandPromise

      expect(error).toBeUndefined()
      expect(stderr).not.toContain('Failed to invalidate previous session')
      expect(mockedSetCliUserConfig).toHaveBeenCalledWith('authToken', 'new-auth-token')
    })

    test('warns on non-401 error when invalidating session', async () => {
      // 500 should produce a warning
      mockedGetCliToken.mockResolvedValue('old-token')
      mockSingleProviderLogin()

      mockApi({
        apiVersion: USERS_API_VERSION,
        method: 'get',
        uri: '/users/me',
      })
        .matchHeader('authorization', 'Bearer old-token')
        .reply(200, {
          email: 'old@example.com',
          id: 'old-user-123',
          name: 'Old User',
          provider: 'github',
        })

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'post',
        uri: '/auth/logout',
      })
        .matchHeader('authorization', 'Bearer old-token')
        .reply(500, {message: 'Internal Server Error'})

      const commandPromise = testCommand(LoginCommand, [])
      await simulateOAuthCallback(commandPromise, 'test-session-id')
      const {error, stderr} = await commandPromise

      expect(error).toBeUndefined()
      expect(stderr).toContain('Failed to invalidate previous session')
      expect(mockedSetCliUserConfig).toHaveBeenCalledWith('authToken', 'new-auth-token')
    })

    test('does not invalidate a previous Sanity API token on new login', async () => {
      mockedGetCliToken.mockResolvedValue('old-api-token')
      mockSingleProviderLogin()

      mockApi({
        apiVersion: USERS_API_VERSION,
        method: 'get',
        uri: '/users/me',
      })
        .matchHeader('authorization', 'Bearer old-api-token')
        .reply(200, {
          id: 'robot-123',
          name: 'Deploy Token',
          provider: 'sanity-token',
        })

      const commandPromise = testCommand(LoginCommand, [])
      await simulateOAuthCallback(commandPromise, 'test-session-id')
      const {error, stderr} = await commandPromise

      expect(error).toBeUndefined()
      expect(stderr).not.toContain('Failed to invalidate previous session')
      expect(mockedSetCliUserConfig).toHaveBeenCalledWith('authToken', 'new-auth-token')
    })

    test('attempts logout when previous token type check fails', async () => {
      mockedGetCliToken.mockResolvedValue('old-token')
      mockSingleProviderLogin()

      mockApi({
        apiVersion: USERS_API_VERSION,
        method: 'get',
        uri: '/users/me',
      })
        .matchHeader('authorization', 'Bearer old-token')
        .reply(500, {message: 'Internal Server Error'})

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'post',
        uri: '/auth/logout',
      })
        .matchHeader('authorization', 'Bearer old-token')
        .reply(200)

      const commandPromise = testCommand(LoginCommand, [])
      await simulateOAuthCallback(commandPromise, 'test-session-id')
      const {error, stderr} = await commandPromise

      if (error) throw error
      expect(stderr).not.toContain('Failed to invalidate previous session')
      expect(mockedSetCliUserConfig).toHaveBeenCalledWith('authToken', 'new-auth-token')
    })
  })

  describe('Non-Interactive Mode', () => {
    test('throws error listing providers when multiple OAuth providers in non-interactive mode', async () => {
      mockedGetCliToken.mockResolvedValue('')
      mockedIsInteractive.mockReturnValue(false)

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/providers',
      }).reply(200, {
        providers: [
          {name: 'google', title: 'Google', url: 'https://api.sanity.io/auth/google'},
          {name: 'github', title: 'GitHub', url: 'https://api.sanity.io/auth/github'},
        ],
      })

      const {error} = await testCommand(LoginCommand, [])

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Multiple login providers available: google, github')
      expect(error?.message).toContain('`--provider <name>`')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('non-interactive error excludes synthetic sso from provider list', async () => {
      mockedGetCliToken.mockResolvedValue('')
      mockedIsInteractive.mockReturnValue(false)

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/providers',
      }).reply(200, {
        providers: [
          {name: 'google', title: 'Google', url: 'https://api.sanity.io/auth/google'},
          {name: 'github', title: 'GitHub', url: 'https://api.sanity.io/auth/github'},
        ],
      })

      const {error} = await testCommand(LoginCommand, ['--experimental'])

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('google, github')
      expect(error?.message).not.toContain('sso')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('throws error listing SSO providers when multiple SSO providers in non-interactive mode', async () => {
      mockedGetCliToken.mockResolvedValue('')
      mockedIsInteractive.mockReturnValue(false)

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/organizations/by-slug/my-org/providers',
      }).reply(200, [
        {
          callbackUrl: 'https://api.sanity.io/auth/saml/callback',
          disabled: false,
          id: 'sso-1',
          loginUrl: 'https://api.sanity.io/auth/saml/login/sso-1',
          name: 'Okta SSO',
          organizationId: 'org-123',
          type: 'saml' as const,
        },
        {
          callbackUrl: 'https://api.sanity.io/auth/saml/callback',
          disabled: false,
          id: 'sso-2',
          loginUrl: 'https://api.sanity.io/auth/saml/login/sso-2',
          name: 'Azure AD',
          organizationId: 'org-123',
          type: 'saml' as const,
        },
      ])

      const {error} = await testCommand(LoginCommand, ['--sso', 'my-org'])

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Multiple SSO providers available')
      expect(error?.message).toContain('Okta SSO')
      expect(error?.message).toContain('Azure AD')
      expect(error?.message).toContain('--sso-provider')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('succeeds non-interactively with a single OAuth provider', async () => {
      mockedGetCliToken.mockResolvedValue('')
      mockedIsInteractive.mockReturnValue(false)
      mockSingleProviderLogin()

      const commandPromise = testCommand(LoginCommand, [])
      await simulateOAuthCallback(commandPromise, 'test-session-id')
      const {error, stdout} = await commandPromise

      if (error) throw error
      expect(stdout).toContain('Login successful')
    })
  })

  describe('--sso-provider Flag', () => {
    test('selects correct SSO provider by name', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/organizations/by-slug/my-org/providers',
      }).reply(200, [
        {
          callbackUrl: 'https://api.sanity.io/auth/saml/callback',
          disabled: false,
          id: 'sso-1',
          loginUrl: 'https://api.sanity.io/auth/saml/login/sso-1',
          name: 'Okta SSO',
          organizationId: 'org-123',
          type: 'saml' as const,
        },
        {
          callbackUrl: 'https://api.sanity.io/auth/saml/callback',
          disabled: false,
          id: 'sso-2',
          loginUrl: 'https://api.sanity.io/auth/saml/login/sso-2',
          name: 'Azure AD',
          organizationId: 'org-123',
          type: 'saml' as const,
        },
      ])

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        query: {sid: 'test-session-id'},
        uri: '/auth/fetch',
      }).reply(200, {label: 'Test Session', token: 'new-auth-token'})

      const commandPromise = testCommand(LoginCommand, [
        '--sso',
        'my-org',
        '--sso-provider',
        'Okta SSO',
      ])
      await simulateOAuthCallback(commandPromise, 'test-session-id')
      const {error, stdout} = await commandPromise

      if (error) throw error
      expect(stdout).toContain('Login successful')
      expect(mockSelect).not.toHaveBeenCalled()
      expect(mockedOpen).toHaveBeenCalledWith(expect.stringContaining('saml/login/sso-1'))
    })

    test('matches SSO provider by name case-insensitively', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/organizations/by-slug/my-org/providers',
      }).reply(200, [
        {
          callbackUrl: 'https://api.sanity.io/auth/saml/callback',
          disabled: false,
          id: 'sso-1',
          loginUrl: 'https://api.sanity.io/auth/saml/login/sso-1',
          name: 'Okta SSO',
          organizationId: 'org-123',
          type: 'saml' as const,
        },
        {
          callbackUrl: 'https://api.sanity.io/auth/saml/callback',
          disabled: false,
          id: 'sso-2',
          loginUrl: 'https://api.sanity.io/auth/saml/login/sso-2',
          name: 'Azure AD',
          organizationId: 'org-123',
          type: 'saml' as const,
        },
      ])

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        query: {sid: 'test-session-id'},
        uri: '/auth/fetch',
      }).reply(200, {label: 'Test Session', token: 'new-auth-token'})

      const commandPromise = testCommand(LoginCommand, [
        '--sso',
        'my-org',
        '--sso-provider',
        'okta sso',
      ])
      await simulateOAuthCallback(commandPromise, 'test-session-id')
      const {error, stdout} = await commandPromise

      if (error) throw error
      expect(stdout).toContain('Login successful')
      expect(mockedOpen).toHaveBeenCalledWith(expect.stringContaining('saml/login/sso-1'))
    })

    test('throws error listing available when SSO provider not found', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/organizations/by-slug/my-org/providers',
      }).reply(200, [
        {
          callbackUrl: 'https://api.sanity.io/auth/saml/callback',
          disabled: false,
          id: 'sso-1',
          loginUrl: 'https://api.sanity.io/auth/saml/login/sso-1',
          name: 'Okta SSO',
          organizationId: 'org-123',
          type: 'saml' as const,
        },
        {
          callbackUrl: 'https://api.sanity.io/auth/saml/callback',
          disabled: false,
          id: 'sso-2',
          loginUrl: 'https://api.sanity.io/auth/saml/login/sso-2',
          name: 'Azure AD',
          organizationId: 'org-123',
          type: 'saml' as const,
        },
      ])

      const {error} = await testCommand(LoginCommand, [
        '--sso',
        'my-org',
        '--sso-provider',
        'Nonexistent',
      ])

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Cannot find SSO provider "Nonexistent"')
      expect(error?.message).toContain('Okta SSO')
      expect(error?.message).toContain('Azure AD')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('errors when --sso-provider is used without --sso', async () => {
      const {error} = await testCommand(LoginCommand, ['--sso-provider', 'Okta SSO'])

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('--sso-provider')
      // oclif flag validation errors (dependsOn) use exit code 2, not 1
      expect(error?.oclif?.exit).toBe(2)
    })

    test('errors for invalid --sso-provider even with single SSO provider', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/organizations/by-slug/my-org/providers',
      }).reply(200, [
        {
          callbackUrl: 'https://api.sanity.io/auth/saml/callback',
          disabled: false,
          id: 'sso-1',
          loginUrl: 'https://api.sanity.io/auth/saml/login/sso-1',
          name: 'Okta SSO',
          organizationId: 'org-123',
          type: 'saml' as const,
        },
      ])

      const {error} = await testCommand(LoginCommand, [
        '--sso',
        'my-org',
        '--sso-provider',
        'Wrong Name',
      ])

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Cannot find SSO provider "Wrong Name"')
      expect(error?.message).toContain('Okta SSO')
      expect(error?.oclif?.exit).toBe(1)
    })
  })
})
