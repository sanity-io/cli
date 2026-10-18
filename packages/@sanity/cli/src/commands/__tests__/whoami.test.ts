import {getCliTokenInfo} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {USERS_API_VERSION} from '../../services/user.js'
import {WhoamiCommand} from '../whoami.js'

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core')>('@sanity/cli-core')
  return {
    ...actual,
    getCliTokenInfo: vi.fn(),
  }
})

const mockedGetCliTokenInfo = vi.mocked(getCliTokenInfo)

const configSource = '/home/user/.config/sanity/config.json'

function mockMe(user: Record<string, unknown>, status = 200) {
  mockApi({apiVersion: USERS_API_VERSION, uri: '/users/me'}).reply(status, user)
}

beforeEach(() => {
  mockedGetCliTokenInfo.mockResolvedValue({source: configSource, token: 'test-token'})
})

afterEach(() => {
  vi.clearAllMocks()
  const pending = pendingMocks()
  cleanAll()
  expect(pending, 'pending mocks').toEqual([])
})

describe('#whoami', () => {
  test('prints the logged in user', async () => {
    mockMe({email: 'jane@example.com', id: 'pUser123', name: 'Jane Doe', provider: 'google'})

    const {error, stdout} = await testCommand(WhoamiCommand, [], {mocks: {token: 'test-token'}})

    if (error) throw error
    expect(stdout).toContain('Jane Doe')
    expect(stdout).toContain('jane@example.com')
    expect(stdout).toContain('pUser123')
    expect(stdout).toContain('Google')
    expect(stdout).toContain(configSource)
  })

  test('labels API tokens and omits the missing email', async () => {
    mockedGetCliTokenInfo.mockResolvedValue({
      source: 'SANITY_AUTH_TOKEN environment variable',
      token: 'robot-token',
    })
    mockMe({email: null, id: 'pRobot1', name: 'CI deploy token', provider: 'sanity-token'})

    const {error, stdout} = await testCommand(WhoamiCommand, [], {mocks: {token: 'robot-token'}})

    if (error) throw error
    expect(stdout).toContain('CI deploy token')
    expect(stdout).toContain('API token')
    expect(stdout).toContain('SANITY_AUTH_TOKEN environment variable')
    expect(stdout).not.toContain('Email')
    expect(stdout).not.toContain('null')
  })

  test('shows the SAML provider id for SSO users', async () => {
    mockMe({email: 'sso@example.com', id: 'pSso1', name: 'SSO User', provider: 'saml-acme'})

    const {error, stdout} = await testCommand(WhoamiCommand, [], {mocks: {token: 'test-token'}})

    if (error) throw error
    expect(stdout).toContain('SAML (acme)')
  })

  test('outputs JSON with --json', async () => {
    mockMe({email: 'jane@example.com', id: 'pUser123', name: 'Jane Doe', provider: 'github'})

    const {error, stdout} = await testCommand(WhoamiCommand, ['--json'], {
      mocks: {token: 'test-token'},
    })

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual({
      email: 'jane@example.com',
      id: 'pUser123',
      name: 'Jane Doe',
      provider: 'github',
      tokenSource: configSource,
    })
  })

  test('fails with exit code 1 when not logged in', async () => {
    mockedGetCliTokenInfo.mockResolvedValue(undefined)

    const {error, stdout} = await testCommand(WhoamiCommand, [], {mocks: {token: undefined}})

    expect(stdout).toBe('')
    expect(error?.message).toContain('Not logged in')
    expect(error?.message).toContain('sanity login')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when the token is rejected', async () => {
    mockMe({message: 'Unauthorized', statusCode: 401}, 401)

    const {error} = await testCommand(WhoamiCommand, [], {mocks: {token: 'test-token'}})

    expect(error).toBeInstanceOf(Error)
  })
})
