import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {devAction} from '../devAction.js'
import {
  createBaseDevOptions,
  createMockOutput,
  DEV_FLAGS,
  workbenchApp,
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
function passedInterfaceSetChange(): (() => Promise<unknown>) | undefined {
  return mockStartDevServerRegistration.mock.calls[0][0].onInterfaceSetChange
}

/** The handler devAction installed last on SIGINT. */
function installedSignalHandler(): (signal: NodeJS.Signals) => void {
  return process.listeners('SIGINT').at(-1) as (signal: NodeJS.Signals) => void
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
        httpPort: 3334,
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

  test('warns but still starts dev when the workbench config is invalid', async () => {
    mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))
    const output = createMockOutput()

    const result = await devAction(
      createBaseDevOptions({
        cliConfig: workbenchCliConfig({app: workbenchApp({name: 'bad name'})}),
        output,
      }),
    )

    expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('unstable_defineApp'))
    expect(result.close).toBeTypeOf('function')
    expect(mockStartStudioDevServer).toHaveBeenCalled()
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

    test('tears down both servers and re-throws when registration fails', async () => {
      // Registration runs after both servers are up, so a failure here must not
      // leak the workbench lock or the dev servers.
      const mockWorkbenchClose = vi.fn().mockResolvedValue(undefined)
      const mockAppClose = vi.fn().mockResolvedValue(undefined)
      mockStartWorkbenchDevServer.mockResolvedValue({
        close: mockWorkbenchClose,
        httpHost: 'localhost',
        workbenchAvailable: true,
        workbenchPort: 3333,
      })
      mockStartStudioDevServer.mockResolvedValue({...mockServer({port: 3334}), close: mockAppClose})
      const registrationError = new Error('deriveInterfaces failed')
      mockStartDevServerRegistration.mockRejectedValue(registrationError)

      const thrown = await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig()})).catch(
        (err) => err,
      )

      expect(thrown).toBe(registrationError)
      expect(mockWorkbenchClose).toHaveBeenCalled()
      expect(mockAppClose).toHaveBeenCalled()
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

      expect(firstClose).toHaveBeenCalledTimes(1)
      expect(mockStartAppDevServer).toHaveBeenCalledTimes(2)
      expect(mockStartAppDevServer).toHaveBeenLastCalledWith(
        expect.objectContaining({cliConfig: freshConfig}),
      )
    })

    test('rebuild hook resolves with the recreated server so the registration can re-read its address', async () => {
      // Workbench projects run with non-strict ports — the replacement server
      // can bind a different port than the one registered at startup.
      const secondServer = mockServer({port: 3335})
      mockStartAppDevServer
        .mockResolvedValueOnce(mockServer({port: 3334}))
        .mockResolvedValueOnce(secondServer)
      mockGetCliConfigUncached.mockResolvedValue(workbenchCliConfig())

      await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig(), isApp: true}))

      await expect(passedInterfaceSetChange()!()).resolves.toBe(secondServer.server)
    })

    test('rebuild hook rejects when the restart reports an expected early exit, and close stays safe', async () => {
      const firstClose = vi.fn().mockResolvedValue(undefined)
      mockStartAppDevServer
        .mockResolvedValueOnce({...mockServer({port: 3334}), close: firstClose})
        // e.g. the user removed organizationId from sanity.cli.ts before saving
        .mockResolvedValueOnce({reason: 'missing-organization-id', started: false})
      mockGetCliConfigUncached.mockResolvedValue(workbenchCliConfig())

      const result = await devAction(
        createBaseDevOptions({cliConfig: workbenchCliConfig(), isApp: true}),
      )

      // The registration must see the failure — a resolved hook would commit
      // the new interface set against a server that never came back.
      await expect(passedInterfaceSetChange()!()).rejects.toThrow(
        'Dev server did not restart after the view/service change',
      )

      // The old server was closed during the rebuild; close() must not call it
      // again or trip over the missing replacement.
      await expect(result.close()).resolves.toBeUndefined()
      expect(firstClose).toHaveBeenCalledTimes(1)
    })

    test('rebuilds the studio server with a freshly-loaded config when the interface set changes', async () => {
      // Studios declare views/services in `sanity.cli.ts` like apps do (only
      // `entry` is rejected, FR-026) — they need the same rebuild hook.
      const firstClose = vi.fn().mockResolvedValue(undefined)
      const secondClose = vi.fn().mockResolvedValue(undefined)
      mockStartStudioDevServer
        .mockResolvedValueOnce({...mockServer({port: 3334}), close: firstClose})
        .mockResolvedValueOnce({...mockServer({port: 3334}), close: secondClose})
      const freshConfig = workbenchCliConfig()
      mockGetCliConfigUncached.mockResolvedValue(freshConfig)

      await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig(), isApp: false}))

      const onSetChange = passedInterfaceSetChange()
      expect(onSetChange).toBeInstanceOf(Function)

      await onSetChange!()

      expect(firstClose).toHaveBeenCalledTimes(1)
      expect(mockStartStudioDevServer).toHaveBeenCalledTimes(2)
      expect(mockStartStudioDevServer).toHaveBeenLastCalledWith(
        expect.objectContaining({cliConfig: freshConfig}),
      )
    })
  })

  test('close() waits for an in-flight rebuild and closes the replacement server', async () => {
    // A close() racing the rebuild would only see the already-torn-down
    // first server — the replacement would keep running (and hold its port)
    // with nothing left to close it.
    const firstClose = vi.fn().mockResolvedValue(undefined)
    const secondClose = vi.fn().mockResolvedValue(undefined)
    let releaseStart!: () => void
    const startGate = new Promise<void>((resolve) => {
      releaseStart = resolve
    })
    mockStartAppDevServer
      .mockResolvedValueOnce({...mockServer({port: 3334}), close: firstClose})
      .mockImplementationOnce(async () => {
        await startGate
        return {...mockServer({port: 3334}), close: secondClose}
      })
    mockGetCliConfigUncached.mockResolvedValue(workbenchCliConfig())

    const result = await devAction(
      createBaseDevOptions({cliConfig: workbenchCliConfig(), isApp: true}),
    )

    // Rebuild is mid-flight (replacement server still starting) when close() runs.
    const rebuild = passedInterfaceSetChange()!()
    const closing = result.close()
    releaseStart()

    await rebuild
    await closing
    expect(secondClose).toHaveBeenCalledTimes(1)
  })

  test('close() is single-flight — a second call shares the same teardown', async () => {
    // SIGINT followed by SIGTERM (each signal keeps its own `once` handler)
    // or a signal racing the caller's own close() must not double-close.
    const appClose = vi.fn().mockResolvedValue(undefined)
    mockStartStudioDevServer.mockResolvedValue({...mockServer({port: 3334}), close: appClose})

    const result = await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig()}))

    await Promise.all([result.close(), result.close()])
    expect(appClose).toHaveBeenCalledTimes(1)
  })

  test('refuses a rebuild once shutdown has started', async () => {
    // The watcher only learns about shutdown late in the teardown sequence —
    // a config save in that window must not boot a server nobody owns.
    mockStartAppDevServer.mockResolvedValue(mockServer({port: 3334}))
    mockGetCliConfigUncached.mockResolvedValue(workbenchCliConfig())

    const result = await devAction(
      createBaseDevOptions({cliConfig: workbenchCliConfig(), isApp: true}),
    )
    await result.close()

    await expect(passedInterfaceSetChange()!()).rejects.toThrow('Dev server is shutting down')
    // Only the initial startup reached startAppDevServer.
    expect(mockStartAppDevServer).toHaveBeenCalledTimes(1)
  })

  describe('signal-triggered shutdown', () => {
    test('re-raises the signal once teardown settles so the default exit runs', async () => {
      // Trapping SIGINT disables Node's default exit; without the re-raise the
      // process would linger on any surviving handle, holding the dev ports.
      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true)
      vi.useFakeTimers()
      try {
        const appClose = vi.fn().mockResolvedValue(undefined)
        mockStartStudioDevServer.mockResolvedValue({...mockServer({port: 3334}), close: appClose})

        await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig()}))

        installedSignalHandler()('SIGINT')
        await vi.runAllTimersAsync()

        expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGINT')
        // Teardown completes before the re-raise.
        expect(appClose.mock.invocationCallOrder[0]).toBeLessThan(
          killSpy.mock.invocationCallOrder[0],
        )
      } finally {
        vi.useRealTimers()
        killSpy.mockRestore()
      }
    })

    test('force-exits after the grace period when teardown hangs', async () => {
      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true)
      vi.useFakeTimers()
      try {
        // e.g. a wedged watcher or socket — close() never settles.
        const hangingClose = vi.fn(() => new Promise<void>(() => {}))
        mockStartStudioDevServer.mockResolvedValue({
          ...mockServer({port: 3334}),
          close: hangingClose,
        })

        await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig()}))

        installedSignalHandler()('SIGTERM')
        await vi.advanceTimersByTimeAsync(5000)

        expect(hangingClose).toHaveBeenCalled()
        expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM')
      } finally {
        vi.useRealTimers()
        killSpy.mockRestore()
      }
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

  test('displays localhost when the workbench binds a non-routable address', async () => {
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      httpHost: '0.0.0.0',
      workbenchAvailable: true,
      workbenchPort: 3333,
    })
    mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))
    const output = createMockOutput()

    await devAction(createBaseDevOptions({output}))

    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('http://localhost:3333'))
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

  describe('workbench remote', () => {
    // The remote is the shell content host apps load, not a host. It opts into
    // this path via an internal env var set by its own dev script.
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    test('serves on the configured port with no shell and no registration', async () => {
      vi.stubEnv('SANITY_INTERNAL_IS_WORKBENCH_REMOTE', 'true')
      mockGetSharedServerConfig.mockReturnValue({httpHost: 'localhost', httpPort: 5173})
      mockStartAppDevServer.mockResolvedValue(mockServer({port: 5173}))

      await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig(), isApp: true}))

      // No second shell, so no single-workbench lock contention.
      expect(mockStartWorkbenchDevServer).not.toHaveBeenCalled()
      // Keeps the configured port — flags pass through untouched, never bumped to
      // `workbenchPort + 1` the way a host app's server is.
      expect(mockStartAppDevServer).toHaveBeenCalledWith(
        expect.objectContaining({
          flags: expect.objectContaining({port: DEV_FLAGS.port}),
          workbenchAvailable: false,
        }),
      )
      // Not a dock app — never registers into the shared workbench registry.
      expect(mockStartDevServerRegistration).not.toHaveBeenCalled()
    })

    test('ignores the env var for a non-workbench (plain) project', async () => {
      vi.stubEnv('SANITY_INTERNAL_IS_WORKBENCH_REMOTE', 'true')
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3333}))

      await devAction(createBaseDevOptions())

      // The brand is the gate — without it the normal workbench path still runs.
      expect(mockStartWorkbenchDevServer).toHaveBeenCalled()
    })
  })
})
