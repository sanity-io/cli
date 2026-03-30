import {getCliToken, setCliUserConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {AUTH_API_VERSION} from '../../services/auth.js'
import {LogoutCommand} from '../logout.js'

const mockConfigStoreDelete = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core')>('@sanity/cli-core')
  return {
    ...actual,
    getCliToken: vi.fn(),
    getUserConfig: vi.fn().mockReturnValue({
      delete: mockConfigStoreDelete,
    }),
    setCliUserConfig: vi.fn(),
  }
})

const mockedGetCliToken = vi.mocked(getCliToken)
const mockedSetConfig = vi.mocked(setCliUserConfig)

afterEach(() => {
  vi.clearAllMocks()
  const pending = nock.pendingMocks()
  nock.cleanAll()
  expect(pending, 'pending mocks').toEqual([])
})

describe('#logout', () => {
  test('logs out successfully if a token exists', async () => {
    mockedGetCliToken.mockResolvedValueOnce('test-token')

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
    mockedGetCliToken.mockResolvedValueOnce('test-token')

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

  test('shows an error if no token exists', async () => {
    mockedGetCliToken.mockResolvedValueOnce('')

    const {stdout} = await testCommand(LogoutCommand)

    expect(stdout).toContain('No login credentials found')
    expect(mockedSetConfig).not.toHaveBeenCalled()
    expect(mockConfigStoreDelete).not.toHaveBeenCalled()
  })

  test('throws error on API failure (non-401)', async () => {
    mockedGetCliToken.mockResolvedValueOnce('test-token')

    mockApi({
      apiVersion: AUTH_API_VERSION,
      method: 'post',
      uri: '/auth/logout',
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(LogoutCommand)

    expect(error).toBeDefined()
    expect(error?.message).toContain('Failed to logout')
    expect(mockedSetConfig).not.toHaveBeenCalled()
    expect(mockConfigStoreDelete).not.toHaveBeenCalled()
  })
})
