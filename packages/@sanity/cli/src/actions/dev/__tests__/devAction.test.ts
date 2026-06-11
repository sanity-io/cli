import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {devAction} from '../devAction.js'
import {
  createBaseDevOptions,
  createMockOutput,
  DEV_FLAGS,
  workbenchCliConfig,
} from './testHelpers.js'

const mockStartWorkbenchDevServer = vi.hoisted(() => vi.fn())
const mockStartAppDevServer = vi.hoisted(() => vi.fn())
const mockStartStudioDevServer = vi.hoisted(() => vi.fn())
const mockStartDevServerRegistration = vi.hoisted(() => vi.fn())
const mockGetSharedServerConfig = vi.hoisted(() => vi.fn())
const mockGetCliConfigUncached = vi.hoisted(() => vi.fn())

// The rebuild hook re-reads the config so the recreated app server picks up the
// new view/service set.
vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getCliConfigUncached: mockGetCliConfigUncached,
}))
vi.mock('../workbench/startWorkbenchDevServer.js', () => ({
  startWorkbenchDevServer: mockStartWorkbenchDevServer,
}))
vi.mock('../servers/startAppDevServer.js', () => ({
  startAppDevServer: mockStartAppDevServer,
}))
vi.mock('../servers/startStudioDevServer.js', () => ({
  startStudioDevServer: mockStartStudioDevServer,
}))
vi.mock('../registration/startDevServerRegistration.js', () => ({
  startDevServerRegistration: mockStartDevServerRegistration,
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
    started: true,
  }
}

function mockRegistrationHandle() {
  return {
    close: vi.fn().mockResolvedValue(undefined),
  }
}

/** Pull the rebuild handler devAction passed into startDevServerRegistration. */
function passedInterfaceSetChange(): (() => Promise<void>) | undefined {
  return mockStartDevServerRegistration.mock.calls[0][0].onInterfaceSetChange
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
    mockStartDevServerRegistration.mockResolvedValue(mockRegistrationHandle())
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('studio mode without workbench passes flags through untouched', async () => {
    mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3333}))
    // No port flag: resolution must stay downstream in getDevServerConfig
    // (flags → env → cli config → default), as it does on main.
    const flags = {...DEV_FLAGS, port: undefined}

    await devAction(createBaseDevOptions({flags}))

    expect(mockStartStudioDevServer).toHaveBeenCalledWith(expect.objectContaining({flags}))
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

  describe('dev server registration', () => {
    test('starts registration when workbench is enabled', async () => {
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))

      await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig()}))

      expect(mockStartDevServerRegistration).toHaveBeenCalledWith(
        expect.objectContaining({
          isApp: false,
          workDir: '/tmp/sanity-project',
        }),
      )
    })

    test('does not start registration when workbench is disabled', async () => {
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3333}))

      await devAction(createBaseDevOptions())

      expect(mockStartDevServerRegistration).not.toHaveBeenCalled()
    })

    test('passes isApp: true for app mode', async () => {
      mockStartAppDevServer.mockResolvedValue(mockServer({port: 3334}))

      await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig(), isApp: true}))

      expect(mockStartDevServerRegistration).toHaveBeenCalledWith(
        expect.objectContaining({isApp: true}),
      )
    })

    test('passes the vite dev server to the registration', async () => {
      const server = mockServer({port: 3334})
      mockStartStudioDevServer.mockResolvedValue(server)

      await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig()}))

      expect(mockStartDevServerRegistration).toHaveBeenCalledWith(
        expect.objectContaining({server: server.server}),
      )
    })

    test('calls registration close on close', async () => {
      const handle = mockRegistrationHandle()
      mockStartDevServerRegistration.mockResolvedValue(handle)
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))

      const result = await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig()}))

      await result.close()
      expect(handle.close).toHaveBeenCalled()
    })

    test('rebuilds the app server with a freshly-loaded config when the interface set changes', async () => {
      const firstClose = vi.fn().mockResolvedValue(undefined)
      const secondClose = vi.fn().mockResolvedValue(undefined)
      mockStartAppDevServer
        .mockResolvedValueOnce({...mockServer({port: 3334}), close: firstClose})
        .mockResolvedValueOnce({...mockServer({port: 3334}), close: secondClose})
      const freshConfig = workbenchCliConfig()
      mockGetCliConfigUncached.mockResolvedValue(freshConfig)

      await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig(), isApp: true}))

      const onSetChange = passedInterfaceSetChange()
      expect(onSetChange).toBeInstanceOf(Function)

      await onSetChange!()

      // Old app server torn down, a new one started with the re-read config.
      expect(firstClose).toHaveBeenCalledTimes(1)
      expect(mockStartAppDevServer).toHaveBeenCalledTimes(2)
      expect(mockStartAppDevServer).toHaveBeenLastCalledWith(
        expect.objectContaining({cliConfig: freshConfig}),
      )
    })

    test('close stays safe when the rebuilt app server reports an expected early exit', async () => {
      const firstClose = vi.fn().mockResolvedValue(undefined)
      mockStartAppDevServer
        .mockResolvedValueOnce({...mockServer({port: 3334}), close: firstClose})
        // e.g. the user removed organizationId from sanity.cli.ts before saving
        .mockResolvedValueOnce({reason: 'missing-organization-id', started: false})
      mockGetCliConfigUncached.mockResolvedValue(workbenchCliConfig())

      const result = await devAction(
        createBaseDevOptions({cliConfig: workbenchCliConfig(), isApp: true}),
      )

      await passedInterfaceSetChange()!()

      // The old server was closed during the rebuild; close() must not call it
      // again or trip over the missing replacement.
      await expect(result.close()).resolves.toBeUndefined()
      expect(firstClose).toHaveBeenCalledTimes(1)
    })

    test('passes no rebuild hook for studios (they declare no interfaces)', async () => {
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))

      await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig(), isApp: false}))

      expect(passedInterfaceSetChange()).toBeUndefined()
    })
  })

  test('registers signal handlers when the workbench is running', async () => {
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      httpHost: 'localhost',
      workbenchAvailable: true,
      workbenchPort: 3333,
    })
    mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))

    const sigintBefore = process.listenerCount('SIGINT')
    const sigtermBefore = process.listenerCount('SIGTERM')

    const result = await devAction(createBaseDevOptions())

    expect(process.listenerCount('SIGINT')).toBe(sigintBefore + 1)
    expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore + 1)

    await result.close()
  })

  test('registers signal handlers for workbench apps even when the workbench is unavailable', async () => {
    // The registry entry still needs cleanup on abrupt shutdown.
    mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3333}))

    const sigintBefore = process.listenerCount('SIGINT')

    const result = await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig()}))

    expect(process.listenerCount('SIGINT')).toBe(sigintBefore + 1)

    await result.close()
  })

  test('close removes signal handlers', async () => {
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      httpHost: 'localhost',
      workbenchAvailable: true,
      workbenchPort: 3333,
    })
    mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))

    const sigintBefore = process.listenerCount('SIGINT')
    const sigtermBefore = process.listenerCount('SIGTERM')

    const result = await devAction(createBaseDevOptions())

    expect(process.listenerCount('SIGINT')).toBe(sigintBefore + 1)
    expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore + 1)

    await result.close()

    expect(process.listenerCount('SIGINT')).toBe(sigintBefore)
    expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore)
  })

  test('registers no signal handlers for plain projects', async () => {
    // Plain runs have no workbench lock or registry entry to clean up, so they
    // keep the default Ctrl-C behavior (and exit code) from main.
    mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3333}))

    const sigintBefore = process.listenerCount('SIGINT')
    const sigtermBefore = process.listenerCount('SIGTERM')

    await devAction(createBaseDevOptions())

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

  test('returns early with workbench-only close when the app server does not start', async () => {
    // startAppDevServer reports an expected early exit when orgId is missing.
    const mockWorkbenchClose = vi.fn().mockResolvedValue(undefined)
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: mockWorkbenchClose,
      httpHost: 'localhost',
      workbenchAvailable: false,
      workbenchPort: 3333,
    })
    mockStartAppDevServer.mockResolvedValue({reason: 'missing-organization-id', started: false})

    const result = await devAction(createBaseDevOptions({isApp: true}))

    expect(result.close).toBeDefined()
    // The close must still tear down the workbench server
    await result.close()
    expect(mockWorkbenchClose).toHaveBeenCalled()
    // No registration should have happened because the app never started
    expect(mockStartDevServerRegistration).not.toHaveBeenCalled()
  })
})
