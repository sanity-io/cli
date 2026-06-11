import {type CliConfig} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  createDevOptions,
  createMockOutput,
  workbenchCliConfig,
} from '../../__tests__/testHelpers.js'
import {type DevActionOptions} from '../../types.js'
import {startAppDevServer} from '../startAppDevServer.js'

const mockStartDevServer = vi.hoisted(() => vi.fn())
const mockGracefulServerDeath = vi.hoisted(() => vi.fn())
const mockGetDevServerConfig = vi.hoisted(() => vi.fn())
const mockGetDashboardAppURL = vi.hoisted(() => vi.fn())

vi.mock('../../../../server/devServer.js', () => ({
  startDevServer: mockStartDevServer,
}))
vi.mock('../../../../server/gracefulServerDeath.js', () => ({
  gracefulServerDeath: mockGracefulServerDeath,
}))
vi.mock('../getDevServerConfig.js', () => ({
  getDevServerConfig: mockGetDevServerConfig,
}))
vi.mock('../getDashboardAppUrl.js', () => ({
  getDashboardAppURL: mockGetDashboardAppURL,
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
    mockGetDashboardAppURL.mockResolvedValue('https://sanity.io/@org-1?dev=http://localhost:3334')
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
    expect(result).toEqual({reason: 'missing-organization-id', started: false})
    expect(mockStartDevServer).not.toHaveBeenCalled()
  })

  test('exits with error when cliConfig has no app property', async () => {
    const output = createMockOutput()
    const result = await startAppDevServer(createOptions({cliConfig: {} as CliConfig, output}))

    expect(output.error).toHaveBeenCalledWith(
      expect.stringContaining('organization ID'),
      expect.objectContaining({exit: 1}),
    )
    expect(result).toEqual({reason: 'missing-organization-id', started: false})
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
    expect(result.started).toBe(true)
    if (!result.started) throw new Error('expected the server to start')
    expect(result.server).toBeDefined()
    expect(result.close).toBeDefined()
  })

  test('logs port and dashboard URL for non-workbench apps', async () => {
    mockStartDevServer.mockResolvedValue(mockServer({port: 3334}))
    const output = createMockOutput()

    await startAppDevServer(createOptions({output}))

    expect(mockGetDashboardAppURL).toHaveBeenCalledWith({
      httpHost: 'localhost',
      httpPort: 3334,
      organizationId: 'org-1',
    })
    expect(output.log).toHaveBeenCalledWith('Dev server started on port 3334')
    expect(output.log).toHaveBeenCalledWith('View your app in the Sanity dashboard here:')
    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining('https://sanity.io/@org-1?dev=http://localhost:3334'),
    )
  })

  test('logs "App dev server started" for workbench apps when workbench is not available', async () => {
    mockStartDevServer.mockResolvedValue(mockServer({port: 3334}))
    const output = createMockOutput()

    await startAppDevServer(
      createOptions({cliConfig: workbenchCliConfig(), output, workbenchAvailable: false}),
    )

    expect(output.log).toHaveBeenCalledWith('App dev server started on port 3334')
    expect(mockGetDashboardAppURL).not.toHaveBeenCalled()
  })

  test('skips the port log line for workbench apps when workbench is available', async () => {
    mockStartDevServer.mockResolvedValue(mockServer({port: 3334}))
    const output = createMockOutput()

    await startAppDevServer(
      createOptions({cliConfig: workbenchCliConfig(), output, workbenchAvailable: true}),
    )

    // 'Starting dev server' is still logged, but the port announcement is not
    const logCalls = (output.log as ReturnType<typeof vi.fn>).mock.calls.flat()
    expect(logCalls.some((c) => String(c).includes('App dev server started'))).toBe(false)
    expect(mockGetDashboardAppURL).not.toHaveBeenCalled()
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
