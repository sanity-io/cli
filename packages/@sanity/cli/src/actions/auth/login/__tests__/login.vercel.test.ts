import {getCliToken, setConfig} from '@sanity/cli-core'
import open from 'open'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {startServerForTokenCallback} from '../../authServer.js'
import {getProvider} from '../getProvider.js'
import {login} from '../login.js'

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getCliToken: vi.fn(),
    setConfig: vi.fn(),
    subdebug: vi.fn(() => vi.fn()),
  }
})

vi.mock('@sanity/cli-core/ux', () => ({
  spinner: vi.fn(() => ({
    start: vi.fn(() => ({
      stop: vi.fn(),
    })),
  })),
}))

vi.mock('open', () => ({default: vi.fn()}))
vi.mock('../../authServer.js', () => ({
  startServerForTokenCallback: vi.fn(),
}))
vi.mock('../getProvider.js', () => ({
  getProvider: vi.fn(),
}))
vi.mock('../../../../util/canLaunchBrowser.js', () => ({
  canLaunchBrowser: vi.fn(() => true),
}))

const mockedGetCliToken = vi.mocked(getCliToken)
const mockedSetConfig = vi.mocked(setConfig)
const mockedStartServerForTokenCallback = vi.mocked(startServerForTokenCallback)
const mockedGetProvider = vi.mocked(getProvider)
const mockedOpen = vi.mocked(open)

const output = {
  log: vi.fn(),
  warn: vi.fn(),
} as unknown as Parameters<typeof login>[0]['output']
const telemetry = {
  trace: vi.fn(() => ({
    complete: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    start: vi.fn(),
  })),
} as unknown as Parameters<typeof login>[0]['telemetry']

describe('#login vercel provider', () => {
  beforeEach(() => {
    mockedGetCliToken.mockResolvedValue(undefined)
    mockedSetConfig.mockResolvedValue(undefined)
    mockedGetProvider.mockResolvedValue({
      name: 'vercel',
      title: 'Vercel',
      url: 'https://api.sanity.io/v1/auth/login/vercel',
    })

    const server = {
      address: vi.fn(() => ({address: '127.0.0.1', family: 'IPv4', port: 4321})),
      close: vi.fn((cb?: () => void) => cb?.()),
    }

    mockedStartServerForTokenCallback.mockResolvedValue({
      loginUrl: new URL(
        'https://api.sanity.io/v1/auth/login/vercel?origin=http%3A%2F%2Flocalhost%3A4321%2Fcallback',
      ),
      server: server as unknown as Awaited<
        ReturnType<typeof startServerForTokenCallback>
      >['server'],
      token: Promise.resolve({label: 'label', token: 'test-token'}),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('uses Vercel provider and bypasses provider selection', async () => {
    await login({open: false, output, provider: 'vercel', telemetry})

    expect(mockedGetProvider).toHaveBeenCalledWith({
      experimental: undefined,
      orgSlug: undefined,
      specifiedProvider: 'vercel',
    })
    expect(mockedStartServerForTokenCallback).toHaveBeenCalledWith(
      'https://api.sanity.io/v1/auth/login/vercel',
    )

    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://api.sanity.io/v1/auth/login/vercel?origin=http%3A%2F%2Flocalhost%3A4321%2Fcallback',
      ),
    )
    expect(mockedOpen).not.toHaveBeenCalled()
    expect(mockedSetConfig).toHaveBeenCalledWith('authToken', 'test-token')
  })
})
