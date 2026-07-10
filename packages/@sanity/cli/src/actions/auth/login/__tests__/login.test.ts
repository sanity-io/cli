import * as configMocks from '@sanity/cli-test/mocks/cli-core/config'
import {createMockOutput} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {MockTelemetry, MockTrace} from '@sanity/cli-test/mocks/cli-core/telemetry'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {login} from '../login.js'

const mockIsHttpError = vi.hoisted(() => vi.fn())
const mockLogout = vi.hoisted(() => vi.fn())
const mockedStartServerForTokenCallback = vi.hoisted(() => vi.fn())
const mockedGetProvider = vi.hoisted(() => vi.fn())
const mockedValidateToken = vi.hoisted(() => vi.fn())
const mockedOpen = vi.hoisted(() => vi.fn())
const mockedIsSanityApiToken = vi.hoisted(() => vi.fn())
const mockedCanLaunchBrowser = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/config', () => import('@sanity/cli-test/mocks/cli-core/config'))
vi.mock('@sanity/cli-core/ux', () => import('@sanity/cli-test/mocks/cli-core/ux'))
vi.mock('@sanity/client', () => ({isHttpError: mockIsHttpError}))
vi.mock('open', () => ({default: mockedOpen}))
vi.mock('../../../../services/auth.js', () => ({
  logout: mockLogout,
}))
vi.mock('../../../../telemetry/login.telemetry.js', () => ({
  LoginTrace: {},
}))
vi.mock('../../../../util/canLaunchBrowser.js', () => ({
  canLaunchBrowser: mockedCanLaunchBrowser,
}))
vi.mock('../../authServer.js', () => ({
  startServerForTokenCallback: mockedStartServerForTokenCallback,
}))
vi.mock('../getProvider.js', () => ({
  getProvider: mockedGetProvider,
}))
vi.mock('../validateToken.js', () => ({
  isSanityApiToken: mockedIsSanityApiToken,
  validateToken: mockedValidateToken,
}))

const output = createMockOutput()
const url =
  'https://api.sanity.io/v1/auth/login/vercel?origin=http%3A%2F%2Flocalhost%3A4321%2Fcallback'
const mockedServerClose = vi.fn((cb?: () => void) => cb?.())
const resolvedToken = {label: 'label', token: 'test-token'}
const fakeServer = {
  address: vi.fn(() => ({address: '127.0.0.1', family: 'IPv4', port: 4321})),
  close: mockedServerClose,
}

describe('#login auth action', () => {
  beforeEach(() => {
    configMocks.getCliToken.mockResolvedValue(undefined)
    configMocks.setCliUserConfig.mockResolvedValue(undefined)
    mockedValidateToken.mockResolvedValue({})
    mockedCanLaunchBrowser.mockReturnValue(true)
    mockedGetProvider.mockResolvedValue({
      name: 'vercel',
      title: 'Vercel',
      url: 'https://api.sanity.io/v1/auth/login/vercel',
    })
    mockedStartServerForTokenCallback.mockResolvedValue({
      loginUrl: new URL(url),
      server: fakeServer,
      token: Promise.resolve(resolvedToken),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('with provided token', () => {
    test('records telemetry errors and rejects if token validation throws', async () => {
      const validationError = new Error('Token is invalid or expired')
      mockedValidateToken.mockRejectedValue(validationError)

      await expect(
        login({output, telemetry: MockTelemetry, token: 'invalid-token'}),
      ).rejects.toThrow(validationError)

      expect(MockTrace.start).toHaveBeenCalled()
      expect(MockTrace.error).toHaveBeenCalledWith(validationError)
      expect(MockTrace.complete).not.toHaveBeenCalled()
      expect(configMocks.setCliUserConfig).not.toHaveBeenCalled()
    })

    test('records telemetry errors and rejects if setting cli user config throws', async () => {
      const fsError = new Error('file system boom')
      configMocks.setCliUserConfig.mockThrow(fsError)

      await expect(
        login({output, telemetry: MockTelemetry, token: 'invalid-token'}),
      ).rejects.toThrow(fsError)

      expect(MockTrace.start).toHaveBeenCalled()
      expect(MockTrace.error).toHaveBeenCalledWith(fsError)
      expect(MockTrace.complete).not.toHaveBeenCalled()
    })
    test('should return early if provided token is valid and stored ok', async () => {
      await login({output, telemetry: MockTelemetry, token: 'valid-token'})
      expect(mockedGetProvider).not.toHaveBeenCalled()
    })
  })

  describe('without provided token', () => {
    test('rejects if no provider found', async () => {
      mockedGetProvider.mockResolvedValue(undefined)
      await expect(login({output, telemetry: MockTelemetry})).rejects.toThrow(
        'No authentication providers found',
      )
    })
    test('should open returned login URL from server-for-token-callback call and await on token promise', async () => {
      await login({output, telemetry: MockTelemetry})
      expect(mockedOpen).toHaveBeenCalledWith(url)
      expect(configMocks.setCliUserConfig).toHaveBeenCalledWith('authToken', resolvedToken.token)
      expect(mockedServerClose).toHaveBeenCalled()
    })
    test('should reject if token promise throws', async () => {
      const err = new Error('boom')
      mockedStartServerForTokenCallback.mockResolvedValue({
        loginUrl: new URL(url),
        server: fakeServer,
        token: Promise.reject(err),
      })
      await expect(login({output, telemetry: MockTelemetry})).rejects.toThrow(err)
      expect(configMocks.setCliUserConfig).not.toHaveBeenCalled()
      expect(mockedServerClose).toHaveBeenCalled()
    })
  })
})
