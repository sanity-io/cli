import {type CliConfig} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {startAppDevServer} from '../startAppDevServer.js'
import {type DevActionOptions} from '../types.js'
import {createDevOptions, createMockOutput} from './testHelpers.js'

const mockStartDevServer = vi.hoisted(() => vi.fn())
const mockGracefulServerDeath = vi.hoisted(() => vi.fn())
const mockGetDevServerConfig = vi.hoisted(() => vi.fn())

vi.mock('../../../server/devServer.js', () => ({
  startDevServer: mockStartDevServer,
}))
vi.mock('../../../server/gracefulServerDeath.js', () => ({
  gracefulServerDeath: mockGracefulServerDeath,
}))
vi.mock('../getDevServerConfig.js', () => ({
  getDevServerConfig: mockGetDevServerConfig,
}))

function mockServer({port = 3333}: {port?: number} = {}) {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    server: {config: {server: {port}}},
  }
}

function createOptions(overrides: Partial<DevActionOptions> = {}): DevActionOptions {
  return createDevOptions({
    cliConfig: {app: {organizationId: 'org-1'}} as unknown as CliConfig,
    isApp: true,
    ...overrides,
  })
}

describe('startAppDevServer', () => {
  beforeEach(() => {
    mockGetDevServerConfig.mockReturnValue({
      basePath: '/',
      cwd: '/tmp/sanity-project',
      httpHost: 'localhost',
      httpPort: 3333,
      reactStrictMode: false,
      staticPath: '/tmp/sanity-project/static',
    })
    mockStartDevServer.mockResolvedValue(mockServer())
    mockGracefulServerDeath.mockImplementation((_cmd, _host, _port, err) => err)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('exits with error when organizationId is missing', async () => {
    const output = createMockOutput()
    const result = await startAppDevServer(
      createOptions({cliConfig: {app: {}} as unknown as CliConfig, output}),
    )

    expect(output.error).toHaveBeenCalledWith(
      expect.stringContaining('organization ID'),
      expect.objectContaining({exit: 1}),
    )
    expect(result).toEqual({})
    expect(mockStartDevServer).not.toHaveBeenCalled()
  })

  test('exits with error when cliConfig has no app property', async () => {
    const output = createMockOutput()
    const result = await startAppDevServer(createOptions({cliConfig: {} as CliConfig, output}))

    expect(output.error).toHaveBeenCalledWith(
      expect.stringContaining('organization ID'),
      expect.objectContaining({exit: 1}),
    )
    expect(result).toEqual({})
  })

  test('starts dev server with isApp and appTitle from cliConfig', async () => {
    mockStartDevServer.mockResolvedValue(mockServer({port: 3334}))

    const result = await startAppDevServer(
      createOptions({
        cliConfig: {
          app: {organizationId: 'org-1', title: 'My App'},
        } as unknown as CliConfig,
      }),
    )

    expect(mockStartDevServer).toHaveBeenCalledWith(
      expect.objectContaining({
        appTitle: 'My App',
        isApp: true,
      }),
    )
    expect(result.server).toBeDefined()
    expect(result.close).toBeDefined()
  })

  test('wraps startup failures via gracefulServerDeath', async () => {
    const originalErr = Object.assign(new Error('boom'), {code: 'EADDRINUSE'})
    const wrappedErr = new Error('friendly message')
    mockStartDevServer.mockRejectedValueOnce(originalErr)
    mockGracefulServerDeath.mockReturnValueOnce(wrappedErr)

    let error: unknown
    try {
      await startAppDevServer(createOptions())
    } catch (err) {
      error = err
    }

    expect(error).toBeInstanceOf(Error)
    expect(error).toBe(wrappedErr)
    expect(mockGracefulServerDeath).toHaveBeenCalledWith('dev', 'localhost', 3333, originalErr)
  })
})
