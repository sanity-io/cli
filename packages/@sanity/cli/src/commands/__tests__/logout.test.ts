import {getCliUserConfig, setCliUserConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {AUTH_API_VERSION} from '../../services/auth.js'
import {LogoutCommand} from '../logout.js'

const mockConfigStoreDelete = vi.hoisted(() => vi.fn())

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

const mockedGetCliUserConfig = vi.mocked(getCliUserConfig)
const mockedSetConfig = vi.mocked(setCliUserConfig)

beforeEach(() => {
  // The command reads SANITY_AUTH_TOKEN directly — a token inherited from the developer's shell
  // (e.g. running the suite from a minted directory) must not leak into the no-env-token cases.
  // An empty stub reads as absent; env-token tests stub their own value over it.
  vi.stubEnv('SANITY_AUTH_TOKEN', '')
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
    vi.stubEnv('SANITY_AUTH_TOKEN', 'sk-robot-token')
    mockedGetCliUserConfig.mockReturnValueOnce(undefined)

    const {error, stderr, stdout} = await testCommand(LogoutCommand)

    expect(error).toBeUndefined()
    expect(stderr).toContain('SANITY_AUTH_TOKEN is set in the environment')
    // oclif wraps warnings, so assert a fragment that fits on one wrapped line.
    expect(stderr).toContain('Remove that variable')
    expect(stdout).not.toContain('No login credentials found')
    expect(mockedSetConfig).not.toHaveBeenCalled()
    expect(mockConfigStoreDelete).not.toHaveBeenCalled()
  })

  test('env token plus stored session: warns about the env token and ends the session', async () => {
    vi.stubEnv('SANITY_AUTH_TOKEN', 'sk-robot-token')
    mockedGetCliUserConfig.mockReturnValueOnce('session-token')

    mockApi({
      apiVersion: AUTH_API_VERSION,
      method: 'post',
      uri: '/auth/logout',
    }).reply(200)

    const {stderr, stdout} = await testCommand(LogoutCommand)

    expect(stderr).toContain('SANITY_AUTH_TOKEN is set in the environment')
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
