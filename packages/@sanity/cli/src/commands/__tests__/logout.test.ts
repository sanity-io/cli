import {getCliUserConfig, setCliUserConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {AUTH_API_VERSION} from '../../services/auth.js'
import {TOKEN_ENV_FILES} from '../../util/envFile.js'
import {LogoutCommand} from '../logout.js'

const mockConfigStoreDelete = vi.hoisted(() => vi.fn())
const mockedResolveCliCredential = vi.hoisted(() => vi.fn())
const mockedGetMintedProjectRecord = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core')>('@sanity/cli-core')
  return {
    ...actual,
    getCliUserConfig: vi.fn(),
    getUserConfig: vi.fn().mockReturnValue({
      delete: mockConfigStoreDelete,
    }),
    setCliUserConfig: vi.fn(),
  }
})
// The active-identity warnings come from the credential resolver; pin it so the tests never read
// real machine state (env, cwd `.env`, the ledger).
vi.mock('@sanity/cli-core/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core/config')>()),
  resolveCliCredential: mockedResolveCliCredential,
}))

vi.mock('../../util/claimNudges.js', () => ({
  getMintedProjectRecord: mockedGetMintedProjectRecord,
}))

const mockedGetCliUserConfig = vi.mocked(getCliUserConfig)
const mockedSetConfig = vi.mocked(setCliUserConfig)

beforeEach(() => {
  mockedResolveCliCredential.mockResolvedValue({source: 'none'})
  mockedGetMintedProjectRecord.mockReturnValue(undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  const pending = pendingMocks()
  cleanAll()
  expect(pending, 'pending mocks').toEqual([])
})

describe('#logout', () => {
  test('logs out successfully if a stored session exists', async () => {
    mockedResolveCliCredential.mockResolvedValue({source: 'session', token: 'test-token'})
    mockedGetCliUserConfig.mockReturnValueOnce('test-token')

    mockApi({
      apiVersion: AUTH_API_VERSION,
      method: 'post',
      uri: '/auth/logout',
    }).reply(200)

    const {stdout} = await testCommand(LogoutCommand)

    expect(stdout).toContain('Logged out successfully')
    expect(mockedSetConfig).toHaveBeenCalledWith('authToken', undefined)
    expect(mockConfigStoreDelete).toHaveBeenCalledWith('telemetryConsent')
  })

  test('logs out successfully when session is expired (401)', async () => {
    mockedGetCliUserConfig.mockReturnValueOnce('test-token')

    mockApi({
      apiVersion: AUTH_API_VERSION,
      method: 'post',
      uri: '/auth/logout',
    }).reply(401, {
      message: 'Unauthorized',
      statusCode: 401,
    })

    const {stdout} = await testCommand(LogoutCommand)

    expect(stdout).toContain('Logged out successfully')
    expect(mockedSetConfig).toHaveBeenCalledWith('authToken', undefined)
    expect(mockConfigStoreDelete).toHaveBeenCalledWith('telemetryConsent')
  })

  test('shows an error if no credentials exist', async () => {
    mockedGetCliUserConfig.mockReturnValueOnce(undefined)

    const {stdout} = await testCommand(LogoutCommand)

    expect(stdout).toContain('No login credentials found')
    expect(mockedSetConfig).not.toHaveBeenCalled()
    expect(mockConfigStoreDelete).not.toHaveBeenCalled()
  })

  test('env token only: explains it cannot be logged out, calls no API', async () => {
    mockedResolveCliCredential.mockResolvedValue({source: 'environment', token: 'sk-robot-token'})
    mockedGetCliUserConfig.mockReturnValueOnce(undefined)

    const {error, stderr, stdout} = await testCommand(LogoutCommand)

    expect(error).toBeUndefined()
    expect(stderr).toContain('SANITY_AUTH_TOKEN is set in the environment')
    expect(stderr.replaceAll(/\s*[›»]\s*/g, ' ').replaceAll(/\s+/g, ' ')).toContain(TOKEN_ENV_FILES)
    // oclif wraps warnings, so assert a fragment that fits on one wrapped line.
    expect(stderr).toContain('Remove that variable')
    expect(stdout).not.toContain('No login credentials found')
    expect(mockedSetConfig).not.toHaveBeenCalled()
    expect(mockConfigStoreDelete).not.toHaveBeenCalled()
  })

  test('minted directory: warns the ledger robot identity survives logout', async () => {
    mockedResolveCliCredential.mockResolvedValue({
      projectId: 'abc123',
      source: 'minted-project',
      token: 'sk-robot',
    })
    mockedGetMintedProjectRecord.mockReturnValue({projectId: 'abc123'})
    mockedGetCliUserConfig.mockReturnValueOnce(undefined)

    const {error, stderr, stdout} = await testCommand(LogoutCommand)

    expect(error).toBeUndefined()
    expect(stderr).toContain('acts as unclaimed Sanity project abc123')
    // The ledger identity counts as credentials — don't claim there are none.
    expect(stdout).not.toContain('No login credentials found')
  })

  test('project-local .env credential: does not claim the project is unclaimed', async () => {
    mockedResolveCliCredential.mockResolvedValue({
      projectId: 'claimed123',
      source: 'minted-project',
      token: 'sk-robot',
    })
    mockedGetCliUserConfig.mockReturnValueOnce(undefined)

    const {error, stderr, stdout} = await testCommand(LogoutCommand)

    expect(error).toBeUndefined()
    expect(stderr).toContain("SANITY_AUTH_TOKEN from this project's .env")
    expect(stderr).not.toContain('unclaimed Sanity project')
    expect(stderr).not.toContain('Claim the project')
    expect(stdout).not.toContain('No login credentials found')
  })

  test('env token plus stored session: warns about the env token and ends the session', async () => {
    mockedResolveCliCredential.mockResolvedValue({source: 'environment', token: 'sk-robot-token'})
    mockedGetCliUserConfig.mockReturnValueOnce('session-token')

    // Matching the Authorization header proves the session token hit /auth/logout; sending the
    // active env token there is the exact leak the command guards against.
    mockApi({
      apiVersion: AUTH_API_VERSION,
      method: 'post',
      uri: '/auth/logout',
    })
      .matchHeader('authorization', 'Bearer session-token')
      .reply(200)

    const {stderr, stdout} = await testCommand(LogoutCommand)

    expect(stderr).toContain('SANITY_AUTH_TOKEN is set in the environment')
    expect(stdout).toContain('Logged out successfully')
    expect(mockedSetConfig).toHaveBeenCalledWith('authToken', undefined)
  })

  test('minted robot plus stored session: warns, and still revokes only the session token', async () => {
    // The robot outranks the session for auth, but logout must still end the stored session,
    // and must never send the robot token to the session logout endpoint.
    mockedResolveCliCredential.mockResolvedValue({
      projectId: 'abc123',
      source: 'minted-project',
      token: 'sk-robot',
    })
    mockedGetMintedProjectRecord.mockReturnValue({projectId: 'abc123'})
    mockedGetCliUserConfig.mockReturnValueOnce('session-token')

    mockApi({
      apiVersion: AUTH_API_VERSION,
      method: 'post',
      uri: '/auth/logout',
    })
      .matchHeader('authorization', 'Bearer session-token')
      .reply(200)

    const {stderr, stdout} = await testCommand(LogoutCommand)

    expect(stderr).toContain('acts as unclaimed Sanity project abc123')
    expect(stdout).toContain('Logged out successfully')
    expect(mockedSetConfig).toHaveBeenCalledWith('authToken', undefined)
  })

  test('surfaces only the status on API failure, never the response body', async () => {
    mockedGetCliUserConfig.mockReturnValueOnce('test-token')

    mockApi({
      apiVersion: AUTH_API_VERSION,
      method: 'post',
      uri: '/auth/logout',
    }).reply(500, {message: 'Populus error: something internal'})

    const {error} = await testCommand(LogoutCommand)

    expect(error).toBeDefined()
    expect(error?.message).toContain('Failed to logout (HTTP 500)')
    expect(error?.message).not.toContain('Populus')
    expect(mockedSetConfig).not.toHaveBeenCalled()
    expect(mockConfigStoreDelete).not.toHaveBeenCalled()
  })
})
