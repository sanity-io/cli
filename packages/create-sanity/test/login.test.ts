import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type RequestOptions} from '../src/api.js'

const requestMock = vi.hoisted(() => vi.fn<(options: RequestOptions) => Promise<unknown>>())
const ui = vi.hoisted(() => ({
  input: vi.fn(),
  interactive: true,
  log: vi.fn(),
  select: vi.fn(),
}))

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  request: requestMock,
}))
vi.mock('../src/ui.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/ui.js')>()),
  input: ui.input,
  isInteractive: () => ui.interactive,
  output: {log: ui.log, warn: vi.fn()},
  select: ui.select,
  spinner: () => {
    const spin = {fail: () => spin, start: () => spin, stop: () => spin, succeed: () => spin}
    return spin
  },
}))

const {ensureAuthenticated} = await import('../src/auth.js')
const {readConfig} = await import('../src/config.js')

const providers = [
  {name: 'google', title: 'Google', url: 'https://api.sanity.io/v1/auth/login/google'},
  {name: 'github', title: 'GitHub', url: 'https://api.sanity.io/v1/auth/login/github'},
]
const user = {email: 'a@example.com', id: 'u1', name: 'Ada', provider: 'github'}

/** Wait for the login URL to be printed, then complete (or break) the browser callback */
async function completeLogin(query: (origin: string) => string, path = '/callback') {
  await vi.waitFor(() => {
    expect(ui.log.mock.calls.some(([line]) => String(line).includes('open a browser'))).toBe(true)
  })
  const line = ui.log.mock.calls.map(([l]) => String(l)).find((l) => l.includes('open a browser'))!
  const loginUrl = new URL(line.trim().split(' ').pop()!)
  const origin = new URL(loginUrl.searchParams.get('origin')!)
  return fetch(`${origin.origin}${path}${query(origin.href)}`, {redirect: 'manual'})
}

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'create-sanity-login-'))
  vi.stubEnv('SANITY_CLI_CONFIG_PATH', join(dir, 'config.json'))
  vi.stubEnv('XDG_CURRENT_DESKTOP', '')
  vi.stubEnv('GDMSESSION', '')
  ui.interactive = true
})
afterEach(async () => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  await rm(dir, {force: true, recursive: true})
})

describe('browser login', () => {
  test('logs in with the chosen provider and stores the token', async () => {
    requestMock.mockImplementation(async ({url}) => {
      if (url === '/auth/providers') return {providers}
      if (url === '/auth/fetch?sid=abc') return {token: 'new-token'}
      if (url === '/users/me') return user
      throw new Error(`Unexpected ${url}`)
    })
    ui.select.mockImplementationOnce(async ({choices}) => {
      expect(choices.map((c: {name: string}) => c.name)).toEqual(['Google', 'GitHub', 'SSO'])
      return choices[1].value
    })
    const loggedIn = ensureAuthenticated({unattended: false})
    const response = await completeLogin(
      () => `?url=${encodeURIComponent('https://api.sanity.io/v1/auth/fetch?sid=abc')}`,
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://www.sanity.io/login/success')
    expect(await loggedIn).toEqual(user)
    expect(readConfig()).toEqual({authToken: 'new-token'})
  })

  test.each([
    ['', 'Missing callback URL', '/login/error'],
    [
      `?url=${encodeURIComponent('https://api.sanity.io/v1/auth/fetch')}`,
      'Missing session ID',
      '/login/error?error=NO_SESSION_ID',
    ],
    [
      `?url=${encodeURIComponent('https://api.sanity.io/v1/auth/fetch?sid=bad')}`,
      'Session expired',
      '/login/error?error=UNRESOLVED_SESSION',
    ],
  ])('fails the login for callback %j', async (query, message, location) => {
    requestMock.mockImplementation(async ({url}) => {
      if (url === '/auth/providers') return {providers}
      throw new Error('Session expired')
    })
    const loggedIn = ensureAuthenticated({provider: 'google', unattended: false}).catch((e) => e)
    // Unknown paths are ignored while waiting for the real callback
    expect((await completeLogin(() => '', '/favicon.ico')).status).toBe(404)
    const response = await completeLogin(() => query)
    expect(response.headers.get('location')).toBe(`https://www.sanity.io${location}`)
    expect((await loggedIn).message).toContain(message)
  })

  test('supports SSO providers', async () => {
    requestMock.mockImplementation(async ({url}) => {
      if (url === '/auth/providers') return {providers}
      if (url === '/auth/organizations/by-slug/acme/providers') {
        return [
          {disabled: true, loginUrl: 'https://x', name: 'Old'},
          {loginUrl: 'https://sso.example/login', name: 'Okta'},
          {loginUrl: 'https://sso2.example/login', name: 'Entra'},
        ]
      }
      if (url === '/auth/fetch?sid=1') return {token: 'sso-token'}
      return user
    })
    ui.select
      .mockImplementationOnce(async ({choices}) => choices[2].value)
      .mockImplementationOnce(async ({choices}) => {
        expect(choices.map((c: {name: string}) => c.name)).toEqual(['Okta', 'Entra'])
        return choices[0].value
      })
    ui.input.mockResolvedValueOnce('acme')
    const loggedIn = ensureAuthenticated({unattended: false})
    await completeLogin(() => `?url=${encodeURIComponent('https://x/auth/fetch?sid=1')}`)
    await loggedIn
    const line = ui.log.mock.calls.map(([l]) => String(l)).find((l) => l.includes('browser'))!
    expect(line).toContain('https://sso.example/login?type=token')
  })

  test('reports unknown providers and ambiguous non-interactive logins', async () => {
    requestMock.mockResolvedValue({providers})
    await expect(ensureAuthenticated({provider: 'nope', unattended: false})).rejects.toThrow(
      'Cannot find login provider with name "nope". Available providers: google, github',
    )
    ui.interactive = false
    await expect(ensureAuthenticated({unattended: false})).rejects.toThrow(
      'Multiple login providers available',
    )
    requestMock.mockResolvedValue({providers: []})
    await expect(ensureAuthenticated({unattended: false})).rejects.toThrow(
      'No authentication providers found',
    )
  })
})
