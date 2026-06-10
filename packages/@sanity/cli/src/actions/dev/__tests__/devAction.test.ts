import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {devAction} from '../devAction.js'
import {createBaseDevOptions, createMockOutput, workbenchCliConfig} from './testHelpers.js'

const mockStartWorkbenchDevServer = vi.hoisted(() => vi.fn())
const mockStartAppDevServer = vi.hoisted(() => vi.fn())
const mockStartStudioDevServer = vi.hoisted(() => vi.fn())
const mockStartFederationRegistration = vi.hoisted(() => vi.fn())
const mockGetSharedServerConfig = vi.hoisted(() => vi.fn())
const mockGetCliConfigUncached = vi.hoisted(() => vi.fn())

// The rebuild hook re-reads the config so the recreated app server picks up the
// new view/service set.
vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getCliConfigUncached: mockGetCliConfigUncached,
}))
vi.mock('../startWorkbenchDevServer.js', () => ({
  startWorkbenchDevServer: mockStartWorkbenchDevServer,
}))
vi.mock('../startAppDevServer.js', () => ({
  startAppDevServer: mockStartAppDevServer,
}))
vi.mock('../startStudioDevServer.js', () => ({
  startStudioDevServer: mockStartStudioDevServer,
}))
vi.mock('../startFederationRegistration.js', () => ({
  startFederationRegistration: mockStartFederationRegistration,
}))
vi.mock('../../../util/getSharedServerConfig.js', () => ({
  getSharedServerConfig: mockGetSharedServerConfig,
}))

/** Create a mock Vite dev server config shape — `server.config.server.host`
 * reflects the resolved host after user-provided Vite config has been merged in. */
function mockServer({host, port = 3334}: {host?: boolean | string; port?: number} = {}) {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    server: {config: {server: {host, port}}},
  }
}

describe('devAction', () => {
  beforeEach(() => {
    mockGetSharedServerConfig.mockReturnValue({httpHost: 'localhost', httpPort: 3333})
    // Default: no workbench (federation disabled)
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      httpHost: 'localhost',
      workbenchAvailable: false,
      workbenchPort: 3333,
    })
    mockStartFederationRegistration.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('studio mode without workbench uses original port', async () => {
    mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3333}))

    await devAction(createBaseDevOptions())

    expect(mockStartStudioDevServer).toHaveBeenCalledWith(
      expect.objectContaining({flags: expect.objectContaining({port: '3333'})}),
    )
  })

  test('studio mode with workbench bumps port and logs workbench URL', async () => {
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      httpHost: 'localhost',
      workbenchAvailable: true,
      workbenchPort: 3333,
    })
    mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))
    const output = createMockOutput()

    await devAction(createBaseDevOptions({output}))

    expect(mockStartStudioDevServer).toHaveBeenCalledWith(
      expect.objectContaining({
        flags: expect.objectContaining({port: '3334'}),
        workbenchAvailable: true,
      }),
    )
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('3333'))
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('3334'))
  })

  test('app mode routes to startAppDevServer', async () => {
    mockStartAppDevServer.mockResolvedValue(mockServer({port: 3333}))

    await devAction(createBaseDevOptions({isApp: true}))

    expect(mockStartAppDevServer).toHaveBeenCalled()
    expect(mockStartStudioDevServer).not.toHaveBeenCalled()
  })

  test('cleans up workbench and re-throws when app/studio startup fails', async () => {
    const mockWorkbenchClose = vi.fn().mockResolvedValue(undefined)
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: mockWorkbenchClose,
      httpHost: 'localhost',
      workbenchAvailable: true,
      workbenchPort: 3333,
    })
    const startupError = new Error('Port already in use')
    mockStartStudioDevServer.mockRejectedValue(startupError)

    const thrown = await devAction(createBaseDevOptions()).catch((err) => err)

    expect(thrown).toBe(startupError)
    expect(mockWorkbenchClose).toHaveBeenCalled()
  })

  test('close handler is resilient to one close rejecting', async () => {
    const mockWorkbenchClose = vi.fn().mockRejectedValue(new Error('workbench close failed'))
    const mockAppClose = vi.fn().mockResolvedValue(undefined)
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: mockWorkbenchClose,
      httpHost: 'localhost',
      workbenchAvailable: true,
      workbenchPort: 3333,
    })
    mockStartStudioDevServer.mockResolvedValue({
      ...mockServer({port: 3334}),
      close: mockAppClose,
    })

    const result = await devAction(createBaseDevOptions())

    await expect(result.close()).resolves.toBeUndefined()
    expect(mockWorkbenchClose).toHaveBeenCalled()
    expect(mockAppClose).toHaveBeenCalled()
  })

  describe('federation registration', () => {
    test('starts federation registration when federation is enabled', async () => {
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))

      await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig()}))

      expect(mockStartFederationRegistration).toHaveBeenCalledWith(
        expect.objectContaining({
          isApp: false,
          workDir: '/tmp/sanity-project',
        }),
      )
    })

    test('does not start federation registration when federation is disabled', async () => {
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3333}))

      await devAction(createBaseDevOptions())

      expect(mockStartFederationRegistration).not.toHaveBeenCalled()
    })

    test('passes isApp: true for app mode', async () => {
      mockStartAppDevServer.mockResolvedValue(mockServer({port: 3334}))

      await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig(), isApp: true}))

      expect(mockStartFederationRegistration).toHaveBeenCalledWith(
        expect.objectContaining({isApp: true}),
      )
    })

    test('passes the vite dev server to federation registration', async () => {
      const server = mockServer({port: 3334})
      mockStartStudioDevServer.mockResolvedValue(server)

      await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig()}))

      expect(mockStartFederationRegistration).toHaveBeenCalledWith(
        expect.objectContaining({server: server.server}),
      )
    })

    test('calls federation close on close', async () => {
      const mockFederationClose = vi.fn().mockResolvedValue(undefined)
      mockStartFederationRegistration.mockResolvedValue({close: mockFederationClose})
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))

      const result = await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig()}))

      await result.close()
      expect(mockFederationClose).toHaveBeenCalled()
    })

    test('rebuilds the app server with a freshly-loaded config when interfaces change', async () => {
      const firstClose = vi.fn().mockResolvedValue(undefined)
      const secondClose = vi.fn().mockResolvedValue(undefined)
      mockStartAppDevServer
        .mockResolvedValueOnce({...mockServer({port: 3334}), close: firstClose})
        .mockResolvedValueOnce({...mockServer({port: 3334}), close: secondClose})
      const freshConfig = workbenchCliConfig()
      mockGetCliConfigUncached.mockResolvedValue(freshConfig)

      await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig(), isApp: true}))

      const {onInterfacesChange} = mockStartFederationRegistration.mock.calls[0][0]
      expect(onInterfacesChange).toBeInstanceOf(Function)

      await onInterfacesChange()

      // Old app server torn down, a new one started with the re-read config.
      expect(firstClose).toHaveBeenCalledTimes(1)
      expect(mockStartAppDevServer).toHaveBeenCalledTimes(2)
      expect(mockStartAppDevServer).toHaveBeenLastCalledWith(
        expect.objectContaining({cliConfig: freshConfig}),
      )
    })

    test('wires no rebuild hook for studios (they declare no interfaces)', async () => {
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))

      await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig(), isApp: false}))

      const {onInterfacesChange} = mockStartFederationRegistration.mock.calls[0][0]
      expect(onInterfacesChange).toBeUndefined()
    })
  })

  test('registers signal handlers that trigger close on SIGINT', async () => {
    const mockWorkbenchClose = vi.fn().mockResolvedValue(undefined)
    const mockAppClose = vi.fn().mockResolvedValue(undefined)
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: mockWorkbenchClose,
      httpHost: 'localhost',
      workbenchAvailable: false,
      workbenchPort: 3333,
    })
    mockStartStudioDevServer.mockResolvedValue({
      ...mockServer({port: 3333}),
      close: mockAppClose,
    })

    await devAction(createBaseDevOptions())

    expect(process.listenerCount('SIGINT')).toBeGreaterThanOrEqual(1)
    expect(process.listenerCount('SIGTERM')).toBeGreaterThanOrEqual(1)
  })

  test('close removes signal handlers', async () => {
    mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3333}))

    const sigintBefore = process.listenerCount('SIGINT')
    const sigtermBefore = process.listenerCount('SIGTERM')

    const result = await devAction(createBaseDevOptions())

    expect(process.listenerCount('SIGINT')).toBe(sigintBefore + 1)
    expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore + 1)

    await result.close()

    expect(process.listenerCount('SIGINT')).toBe(sigintBefore)
    expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore)
  })

  test('uses local httpHost for workbench URL even when existing lock reports a different host', async () => {
    // Scenario: process A started workbench on mydev.local:3333, process B starts
    // with --host localhost. startWorkbenchDevServer returns the existing lock's host,
    // but devAction ignores it and uses its own httpHost from getSharedServerConfig.
    mockGetSharedServerConfig.mockReturnValue({httpHost: 'localhost', httpPort: 3333})
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      httpHost: 'mydev.local',
      workbenchAvailable: true,
      workbenchPort: 3333,
    })
    mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))
    const output = createMockOutput()

    await devAction(createBaseDevOptions({output}))

    // The workbench is running on mydev.local — the URL should reflect the
    // existing workbench's host, not the caller's.
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('mydev.local:3333'))
  })

  test('returns early with workbench-only close when app server exits without a server', async () => {
    // startAppDevServer resolves with {} when orgId is missing — no `server`.
    const mockWorkbenchClose = vi.fn().mockResolvedValue(undefined)
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: mockWorkbenchClose,
      httpHost: 'localhost',
      workbenchAvailable: false,
      workbenchPort: 3333,
    })
    mockStartAppDevServer.mockResolvedValue({})

    const result = await devAction(createBaseDevOptions({isApp: true}))

    expect(result.close).toBeDefined()
    // The close must still tear down the workbench server
    await result.close()
    expect(mockWorkbenchClose).toHaveBeenCalled()
    // No registration should have happened because federation wasn't evaluated
    expect(mockStartFederationRegistration).not.toHaveBeenCalled()
  })
})
