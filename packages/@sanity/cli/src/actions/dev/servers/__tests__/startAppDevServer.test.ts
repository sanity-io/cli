import {type CliConfig} from '@sanity/cli-core/types'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  createDevOptions,
  createMockDevServer,
  createMockOutput,
  DEV_FLAGS,
  DEV_SERVER_CONFIG,
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

function createOptions(overrides: Partial<DevActionOptions> = {}): DevActionOptions {
  return createDevOptions({
    cliConfig: {app: {organizationId: 'org-1'}} as unknown as CliConfig,
    isApp: true,
    ...overrides,
  })
}

describe('startAppDevServer', () => {
  beforeEach(() => {
    mockGetDevServerConfig.mockReturnValue(DEV_SERVER_CONFIG)
    mockStartDevServer.mockResolvedValue(createMockDevServer())
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
    mockStartDevServer.mockResolvedValue(createMockDevServer({port: 3334}))

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

  test('warns when load-in-dashboard is disabled for non-workbench apps', async () => {
    const output = createMockOutput()

    await startAppDevServer(
      createOptions({flags: {...DEV_FLAGS, 'load-in-dashboard': false}, output}),
    )

    expect(output.warn).toHaveBeenCalledWith('Apps cannot run without the Sanity dashboard')
    expect(output.warn).toHaveBeenCalledWith(
      'Starting dev server with the --load-in-dashboard flag set to true',
    )
  })

  test('does not warn about the dashboard for workbench apps', async () => {
    const output = createMockOutput()

    await startAppDevServer(
      createOptions({
        cliConfig: workbenchCliConfig(),
        flags: {...DEV_FLAGS, 'load-in-dashboard': false},
        output,
      }),
    )

    expect(output.warn).not.toHaveBeenCalled()
  })

  test('logs port and dashboard URL for non-workbench apps', async () => {
    mockStartDevServer.mockResolvedValue(createMockDevServer({port: 3334}))
    const output = createMockOutput()

    await startAppDevServer(
      createOptions({flags: {...DEV_FLAGS, 'load-in-dashboard': true}, output}),
    )

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

  test('logs "App dev server started" for workbench apps when asked to announce its URL', async () => {
    mockStartDevServer.mockResolvedValue(createMockDevServer({port: 3334}))
    const output = createMockOutput()

    await startAppDevServer(
      createOptions({announceUrl: true, cliConfig: workbenchCliConfig(), output}),
    )

    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('App dev server started at'))
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('http://localhost:3334'))
    expect(mockGetDashboardAppURL).not.toHaveBeenCalled()
  })

  test('skips the port log line for workbench apps when the workbench announces instead', async () => {
    mockStartDevServer.mockResolvedValue(createMockDevServer({port: 3334}))
    const output = createMockOutput()

    await startAppDevServer(
      createOptions({announceUrl: false, cliConfig: workbenchCliConfig(), output}),
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
