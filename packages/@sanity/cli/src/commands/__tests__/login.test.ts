import http from 'node:http'

import {getCliToken, setConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import open from 'open'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {AUTH_API_VERSION} from '../../services/auth.js'
import {canLaunchBrowser} from '../../util/canLaunchBrowser.js'
import {LoginCommand} from '../login.js'

// Hoisted mocks for user prompts
const mockInput = vi.hoisted(() => vi.fn())
const mockSelect = vi.hoisted(() => vi.fn())

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

// Mock CLI core functions with real test client for HTTP
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  const {createTestClient: createClient} = await import('@sanity/cli-test')
  const testClient = createClient({
    apiVersion: 'v2025-09-23',
    token: undefined,
  })

  return {
    ...actual,
    getCliToken: vi.fn(),
    getGlobalCliClient: vi.fn().mockResolvedValue({
      request: testClient.request,
      withConfig: vi.fn().mockReturnValue({request: testClient.request}),
    }),
    setConfig: vi.fn(),
  }
})

const mockedGetCliToken = vi.mocked(getCliToken)
const mockedSetConfig = vi.mocked(setConfig)
const mockedOpen = vi.mocked(open)
const mockedCanLaunchBrowser = vi.mocked(canLaunchBrowser)

/**
 * Simulates OAuth provider redirecting back to local callback server.
 * Makes actual HTTP request to the running local server in test.
 */
async function simulateOAuthCallback(
  port: number,
  sessionId: string,
  delay = 100,
): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, delay))

  const url = `http://localhost:${port}/callback?url=${encodeURIComponent(
    `https://api.sanity.io/auth/fetch?sid=${sessionId}`,
  )}`

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

describe('#login', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  describe('Provider Selection', () => {
    // Error/early-exit tests first (no auth server started, so no port conflicts)

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
      const statusCode = await simulateOAuthCallback(4321, 'test-session-id')
      const {error, stdout} = await commandPromise

      expect(error).toBeUndefined()
      expect(stdout).toContain('Login successful')

      // Callback returns 303 redirect
      expect(statusCode).toBe(303)

      // Browser opened with provider URL
      expect(mockedOpen).toHaveBeenCalledWith(expect.stringContaining('auth/google'))

      // Token stored, telemetry cleared, correct order
      expect(mockedSetConfig).toHaveBeenCalledTimes(2)
      expect(mockedSetConfig.mock.calls[0]).toEqual(['authToken', 'new-auth-token'])
      expect(mockedSetConfig.mock.calls[1]).toEqual(['telemetryConsent', undefined])
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
      await simulateOAuthCallback(4321, 'test-session-id')
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
      await simulateOAuthCallback(4321, 'test-session-id')
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
      await simulateOAuthCallback(4321, 'test-session-id')
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
      await simulateOAuthCallback(4321, 'test-session-id')
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
      await simulateOAuthCallback(4321, 'test-session-id')
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
      await simulateOAuthCallback(4321, 'test-session-id')
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
      await simulateOAuthCallback(4321, 'test-session-id')
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
      await simulateOAuthCallback(4321, 'test-session-id')
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
      await simulateOAuthCallback(4321, 'test-session-id')
      const {error, stdout} = await commandPromise

      expect(error).toBeUndefined()
      expect(stdout).toContain('Please open a browser at')
      expect(mockedOpen).not.toHaveBeenCalled()
    })
  })

  describe('Auth Server and Token Exchange', () => {
    test('falls back to next port when first port is busy', async () => {
      mockedGetCliToken.mockResolvedValue('')
      mockedCanLaunchBrowser.mockReturnValue(true)

      mockSingleProviderLogin()

      // Block port 4321
      const blockingServer = http.createServer()
      await new Promise<void>((resolve) => {
        blockingServer.listen(4321, () => resolve())
      })

      try {
        const commandPromise = testCommand(LoginCommand, [])
        // Should fall back to port 4000
        await simulateOAuthCallback(4000, 'test-session-id')
        const {error} = await commandPromise

        expect(error).toBeUndefined()

        // Verify login URL uses fallback port
        const loginUrl = mockedOpen.mock.calls[0][0] as string
        expect(loginUrl).toContain('4000')
      } finally {
        await new Promise<void>((resolve) => {
          blockingServer.close(() => resolve())
        })
      }
    }, 10_000)

    test('throws error when all ports are busy', async () => {
      mockedGetCliToken.mockResolvedValue('')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'get',
        uri: '/auth/providers',
      }).reply(200, {
        providers: [{name: 'google', title: 'Google', url: 'https://api.sanity.io/auth/google'}],
      })

      // Block all callback ports
      const ports = [4321, 4000, 3003, 1234, 8080, 13_333]
      const blockingServers: http.Server[] = []

      for (const port of ports) {
        const server = http.createServer()
        server.on('error', () => {
          // Port may already be in use, which is fine for our purposes
        })
        await new Promise<void>((resolve) => {
          server.once('listening', () => {
            blockingServers.push(server)
            resolve()
          })
          server.once('error', () => {
            // Port already blocked, that works too
            resolve()
          })
          server.listen(port)
        })
      }

      try {
        const {error} = await testCommand(LoginCommand, [])

        expect(error).toBeDefined()
        expect(error?.message).toContain('Failed to find port number to bind auth callback server')
      } finally {
        await Promise.all(
          blockingServers.map(
            (server) =>
              new Promise<void>((resolve) => {
                server.close(() => resolve())
              }),
          ),
        )
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

      // Wait for server to start
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Missing url parameter
      const missingUrlStatus = await new Promise<number>((resolve, reject) => {
        http
          .get('http://localhost:4321/callback', (res) => {
            res.resume()
            resolve(res.statusCode || 0)
          })
          .on('error', reject)
      })

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

      // Wait for server to start
      await new Promise((resolve) => setTimeout(resolve, 100))

      // URL present but no sid parameter
      const missingSidStatus = await new Promise<number>((resolve, reject) => {
        const url = `http://localhost:4321/callback?url=${encodeURIComponent(
          'https://api.sanity.io/auth/fetch',
        )}`
        http
          .get(url, (res) => {
            res.resume()
            resolve(res.statusCode || 0)
          })
          .on('error', reject)
      })

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
      await simulateOAuthCallback(4321, 'bad-session')
      const {error} = await commandPromise

      expect(error).toBeDefined()
      expect(error?.message).toContain('Login failed')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('returns 404 for non-callback endpoints', async () => {
      mockedGetCliToken.mockResolvedValue('')
      mockSingleProviderLogin()

      const commandPromise = testCommand(LoginCommand, [])

      // Wait for server to start
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Make request to non-callback endpoint
      const statusCode = await new Promise<number>((resolve, reject) => {
        http
          .get('http://localhost:4321/other', (res) => {
            res.resume()
            resolve(res.statusCode || 0)
          })
          .on('error', reject)
      })

      expect(statusCode).toBe(404)

      // Complete the login
      await simulateOAuthCallback(4321, 'test-session-id')
      const {error} = await commandPromise
      expect(error).toBeUndefined()
    })
  })

  describe('Session Management', () => {
    test('invalidates existing session on new login', async () => {
      mockedGetCliToken.mockResolvedValue('old-auth-token')
      mockSingleProviderLogin()

      // Mock logout call
      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'post',
        uri: '/auth/logout',
      }).reply(200)

      const commandPromise = testCommand(LoginCommand, [])
      await simulateOAuthCallback(4321, 'test-session-id')
      const {error} = await commandPromise

      expect(error).toBeUndefined()
      expect(mockedSetConfig).toHaveBeenCalledWith('authToken', 'new-auth-token')
    })

    test('handles session invalidation errors gracefully', async () => {
      // 401 should be silently ignored (expired token)
      mockedGetCliToken.mockResolvedValue('expired-token')
      mockSingleProviderLogin('session-401')

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'post',
        uri: '/auth/logout',
      }).reply(401, {message: 'Unauthorized'})

      const commandPromise = testCommand(LoginCommand, [])
      await simulateOAuthCallback(4321, 'session-401')
      const {error, stdout} = await commandPromise

      expect(error).toBeUndefined()
      expect(stdout).not.toContain('Failed to invalidate previous session')
      expect(mockedSetConfig).toHaveBeenCalledWith('authToken', 'new-auth-token')
    })

    test('warns on non-401 error when invalidating session', async () => {
      // 500 should produce a warning
      mockedGetCliToken.mockResolvedValue('old-token')
      mockSingleProviderLogin()

      mockApi({
        apiVersion: AUTH_API_VERSION,
        method: 'post',
        uri: '/auth/logout',
      }).reply(500, {message: 'Internal Server Error'})

      const commandPromise = testCommand(LoginCommand, [])
      await simulateOAuthCallback(4321, 'test-session-id')
      const {error, stderr} = await commandPromise

      expect(error).toBeUndefined()
      expect(stderr).toContain('Failed to invalidate previous session')
      expect(mockedSetConfig).toHaveBeenCalledWith('authToken', 'new-auth-token')
    })
  })
})
