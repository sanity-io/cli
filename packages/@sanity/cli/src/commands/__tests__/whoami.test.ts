import {getCliTokenInfo} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {resolveSSOProvider} from '../../actions/whoami/resolveSSOProvider.js'
import {USERS_API_VERSION} from '../../services/user.js'
import {WhoamiCommand} from '../whoami.js'

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core')>('@sanity/cli-core')
  return {
    ...actual,
    getCliTokenInfo: vi.fn(),
  }
})

vi.mock('../../actions/whoami/resolveSSOProvider.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../actions/whoami/resolveSSOProvider.js')>()),
  resolveSSOProvider: vi.fn(),
}))

const mockedGetCliTokenInfo = vi.mocked(getCliTokenInfo)
const mockedResolveSSOProvider = vi.mocked(resolveSSOProvider)

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
    expect(mockedResolveSSOProvider).not.toHaveBeenCalled()
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

  test('shows the SSO provider and organization slug for SAML users', async () => {
    mockedResolveSSOProvider.mockResolvedValueOnce({
      organizationId: 'oAcme',
      organizationName: 'Acme Corp',
      organizationSlug: 'acme-corp',
      providerId: 'pOkta',
      providerName: 'Okta SSO',
    })
    mockMe({email: 'sso@example.com', id: 'pSso1', name: 'SSO User', provider: 'saml-pOkta'})

    const {error, stdout} = await testCommand(WhoamiCommand, [], {mocks: {token: 'test-token'}})

    if (error) throw error
    expect(mockedResolveSSOProvider).toHaveBeenCalledWith('pOkta')
    expect(stdout).toContain('SAML SSO (Okta SSO)')
    expect(stdout).toContain('Acme Corp (sanity login --sso acme-corp)')
  })

  test('shows the organization name when it has no slug', async () => {
    mockedResolveSSOProvider.mockResolvedValueOnce({
      organizationId: 'oAcme',
      organizationName: 'Acme Corp',
      organizationSlug: null,
      providerId: 'pOkta',
      providerName: 'Okta SSO',
    })
    mockMe({email: 'sso@example.com', id: 'pSso1', name: 'SSO User', provider: 'saml-pOkta'})

    const {error, stdout} = await testCommand(WhoamiCommand, [], {mocks: {token: 'test-token'}})

    if (error) throw error
    expect(stdout).toContain('Acme Corp')
    expect(stdout).not.toContain('--sso')
  })

  test('falls back to "SAML SSO" when the provider cannot be resolved', async () => {
    mockedResolveSSOProvider.mockResolvedValueOnce(undefined)
    mockMe({email: 'sso@example.com', id: 'pSso1', name: 'SSO User', provider: 'saml-pOkta'})

    const {error, stdout} = await testCommand(WhoamiCommand, [], {mocks: {token: 'test-token'}})

    if (error) throw error
    expect(stdout).toContain('SAML SSO')
    expect(stdout).not.toContain('pOkta')
    expect(stdout).not.toContain('Org')
  })

  test('includes SSO details in --json for SAML users', async () => {
    const sso = {
      organizationId: 'oAcme',
      organizationName: 'Acme Corp',
      organizationSlug: 'acme-corp',
      providerId: 'pOkta',
      providerName: 'Okta SSO',
    }
    mockedResolveSSOProvider.mockResolvedValueOnce(sso)
    mockMe({email: 'sso@example.com', id: 'pSso1', name: 'SSO User', provider: 'saml-pOkta'})

    const {error, stdout} = await testCommand(WhoamiCommand, ['--json'], {
      mocks: {token: 'test-token'},
    })

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual({
      email: 'sso@example.com',
      id: 'pSso1',
      name: 'SSO User',
      provider: 'saml-pOkta',
      sso,
      tokenSource: configSource,
    })
  })

  test('reports sso as null in --json when the provider cannot be resolved', async () => {
    mockedResolveSSOProvider.mockResolvedValueOnce(undefined)
    mockMe({email: 'sso@example.com', id: 'pSso1', name: 'SSO User', provider: 'saml-pOkta'})

    const {error, stdout} = await testCommand(WhoamiCommand, ['--json'], {
      mocks: {token: 'test-token'},
    })

    if (error) throw error
    expect(JSON.parse(stdout).sso).toBeNull()
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

  test('outputs a null email in --json for API tokens', async () => {
    mockedGetCliTokenInfo.mockResolvedValue({
      source: 'SANITY_AUTH_TOKEN environment variable',
      token: 'robot-token',
    })
    mockMe({id: 'pRobot1', name: 'CI deploy token', provider: 'sanity-token'})

    const {error, stdout} = await testCommand(WhoamiCommand, ['--json'], {
      mocks: {token: 'robot-token'},
    })

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual({
      email: null,
      id: 'pRobot1',
      name: 'CI deploy token',
      provider: 'sanity-token',
      tokenSource: 'SANITY_AUTH_TOKEN environment variable',
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
