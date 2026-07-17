import {createMockOutput} from '@sanity/cli-test/test/util'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {startWorkbenchDev, type StartWorkbenchDevOptions} from '../startWorkbenchDev.js'
import {workbenchCliConfig} from './devTestHelpers.js'

const mockStartWorkbenchDevServer = vi.hoisted(() => vi.fn())
const mockStartDevServerRegistration = vi.hoisted(() => vi.fn())
const mockGetCliConfigUncached = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getCliConfigUncached: mockGetCliConfigUncached,
}))
vi.mock('../startWorkbenchDevServer.js', () => ({
  startWorkbenchDevServer: mockStartWorkbenchDevServer,
}))
vi.mock('../startDevServerRegistration.js', () => ({
  startDevServerRegistration: mockStartDevServerRegistration,
}))

/** A started app/studio dev server result, with a distinct close per call. */
function mockAppServer({port = 3334}: {port?: number} = {}) {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    server: {config: {server: {port}}, httpServer: {address: () => ({port})}},
    started: true as const,
  }
}

const mockStartAppServer = vi.hoisted(() => vi.fn())
const mockExtractManifest = vi.hoisted(() => vi.fn())
const mockCheckForDeprecatedAppId = vi.hoisted(() => vi.fn())

function run(overrides: Partial<StartWorkbenchDevOptions> = {}) {
  return startWorkbenchDev({
    appId: undefined,
    cacheDir: '/tmp/sanity-project/.sanity/vite',
    checkForDeprecatedAppId: mockCheckForDeprecatedAppId,
    cliConfig: workbenchCliConfig(),
    extractManifest: mockExtractManifest,
    httpHost: 'localhost',
    httpPort: 3333,
    isApp: true,
    output: createMockOutput(),
    reactStrictMode: false,
    startAppServer: mockStartAppServer,
    workDir: '/tmp/sanity-project',
    ...overrides,
  })
}

/** Pull the rebuild hook the orchestrator handed to the registration. */
function passedRebuild(): () => Promise<unknown> {
  return mockStartDevServerRegistration.mock.calls[0][0].onInterfaceSetChange
}

/** The signal handler installed last. */
function installedSignalHandler(): (signal: NodeJS.Signals) => void {
  return process.listeners('SIGINT').at(-1) as (signal: NodeJS.Signals) => void
}

describe('startWorkbenchDev', () => {
  beforeEach(() => {
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      httpHost: 'localhost',
      workbenchAvailable: true,
      workbenchPort: 3333,
    })
    mockStartDevServerRegistration.mockResolvedValue({close: vi.fn().mockResolvedValue(undefined)})
    mockStartAppServer.mockResolvedValue(mockAppServer({port: 3334}))
    mockGetCliConfigUncached.mockResolvedValue(workbenchCliConfig())
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('port + URL announcement', () => {
    test('binds the app server to the next port and silences its URL when the workbench runs', async () => {
      await run()

      expect(mockStartAppServer).toHaveBeenCalledWith(
        expect.objectContaining({announceUrl: false, httpPort: 3334}),
      )
    })

    test('keeps the configured port and announces the URL when the workbench is unavailable', async () => {
      mockStartWorkbenchDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        httpHost: 'localhost',
        workbenchAvailable: false,
        workbenchPort: 3333,
      })

      await run()

      expect(mockStartAppServer).toHaveBeenCalledWith(
        expect.objectContaining({announceUrl: true, httpPort: 3333}),
      )
    })

    test('logs the workbench URL with the app port when the workbench runs', async () => {
      const output = createMockOutput()
      await run({output})

      expect(output.log).toHaveBeenCalledWith(expect.stringContaining('http://localhost:3333'))
    })

    test('shows the existing lock host in the URL, not the caller host', async () => {
      mockStartWorkbenchDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        httpHost: 'mydev.local',
        workbenchAvailable: true,
        workbenchPort: 3333,
      })
      const output = createMockOutput()

      await run({output})

      expect(output.log).toHaveBeenCalledWith(expect.stringContaining('mydev.local:3333'))
    })

    test('falls back to localhost for a non-routable bind address', async () => {
      mockStartWorkbenchDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        httpHost: '0.0.0.0',
        workbenchAvailable: true,
        workbenchPort: 3333,
      })
      const output = createMockOutput()

      await run({output})

      expect(output.log).toHaveBeenCalledWith(expect.stringContaining('http://localhost:3333'))
    })
  })

  describe('registration', () => {
    test('checks for the deprecated app id, then registers with the live server', async () => {
      const server = mockAppServer({port: 3334})
      mockStartAppServer.mockResolvedValue(server)

      await run({appId: 'app-abc', isApp: true})

      expect(mockCheckForDeprecatedAppId).toHaveBeenCalled()
      expect(mockStartDevServerRegistration).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: 'app-abc',
          extractManifest: mockExtractManifest,
          isApp: true,
          server: server.server,
        }),
      )
    })

    test('tears down both servers and re-throws when registration fails', async () => {
      const workbenchClose = vi.fn().mockResolvedValue(undefined)
      const appClose = vi.fn().mockResolvedValue(undefined)
      mockStartWorkbenchDevServer.mockResolvedValue({
        close: workbenchClose,
        httpHost: 'localhost',
        workbenchAvailable: true,
        workbenchPort: 3333,
      })
      mockStartAppServer.mockResolvedValue({...mockAppServer({port: 3334}), close: appClose})
      const registrationError = new Error('deriveInterfaces failed')
      mockStartDevServerRegistration.mockRejectedValue(registrationError)

      const thrown = await run().catch((err) => err)

      expect(thrown).toBe(registrationError)
      expect(workbenchClose).toHaveBeenCalled()
      expect(appClose).toHaveBeenCalled()
    })

    test('closes the registration on close', async () => {
      const handle = {close: vi.fn().mockResolvedValue(undefined)}
      mockStartDevServerRegistration.mockResolvedValue(handle)

      const {close} = await run()
      await close()

      expect(handle.close).toHaveBeenCalled()
    })

    test('returns a workbench-only close and skips registration when the app server does not start', async () => {
      const workbenchClose = vi.fn().mockResolvedValue(undefined)
      mockStartWorkbenchDevServer.mockResolvedValue({
        close: workbenchClose,
        httpHost: 'localhost',
        workbenchAvailable: false,
        workbenchPort: 3333,
      })
      mockStartAppServer.mockResolvedValue({reason: 'missing-organization-id', started: false})

      const {close} = await run()
      await close()

      expect(workbenchClose).toHaveBeenCalled()
      expect(mockStartDevServerRegistration).not.toHaveBeenCalled()
    })
  })

  describe('rebuild', () => {
    test('rebuilds the app server with a freshly-loaded config when the interface set changes', async () => {
      const first = mockAppServer({port: 3334})
      const second = mockAppServer({port: 3334})
      mockStartAppServer.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
      const freshConfig = workbenchCliConfig()
      mockGetCliConfigUncached.mockResolvedValue(freshConfig)

      await run()
      await passedRebuild()()

      expect(first.close).toHaveBeenCalledTimes(1)
      expect(mockStartAppServer).toHaveBeenCalledTimes(2)
      expect(mockStartAppServer).toHaveBeenLastCalledWith(
        expect.objectContaining({cliConfig: freshConfig}),
      )
    })

    test('the rebuild hook resolves with the recreated server', async () => {
      const second = mockAppServer({port: 3335})
      mockStartAppServer
        .mockResolvedValueOnce(mockAppServer({port: 3334}))
        .mockResolvedValueOnce(second)

      await run()

      await expect(passedRebuild()()).resolves.toBe(second.server)
    })

    test('the rebuild hook rejects on an expected early exit, and close stays safe', async () => {
      const first = mockAppServer({port: 3334})
      mockStartAppServer
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce({reason: 'missing-organization-id', started: false})

      const {close} = await run()

      await expect(passedRebuild()()).rejects.toThrow(
        'Dev server did not restart after the view/service change',
      )
      await expect(close()).resolves.toBeUndefined()
      expect(first.close).toHaveBeenCalledTimes(1)
    })

    test('close() waits for an in-flight rebuild and closes the replacement server', async () => {
      const first = mockAppServer({port: 3334})
      const second = mockAppServer({port: 3334})
      let releaseStart!: () => void
      const startGate = new Promise<void>((resolve) => {
        releaseStart = resolve
      })
      mockStartAppServer.mockResolvedValueOnce(first).mockImplementationOnce(async () => {
        await startGate
        return second
      })

      const {close} = await run()
      const rebuild = passedRebuild()()
      const closing = close()
      releaseStart()

      await rebuild
      await closing
      expect(second.close).toHaveBeenCalledTimes(1)
    })

    test('refuses a rebuild once shutdown has started', async () => {
      const {close} = await run()
      await close()

      await expect(passedRebuild()()).rejects.toThrow('Dev server is shutting down')
      // Only the initial startup reached the app server.
      expect(mockStartAppServer).toHaveBeenCalledTimes(1)
    })
  })

  describe('signals', () => {
    test('close() is single-flight — a second call shares the same teardown', async () => {
      const appClose = vi.fn().mockResolvedValue(undefined)
      mockStartAppServer.mockResolvedValue({...mockAppServer({port: 3334}), close: appClose})

      const {close} = await run()
      await Promise.all([close(), close()])

      expect(appClose).toHaveBeenCalledTimes(1)
    })

    test('registers signal handlers and removes them on close', async () => {
      const sigintBefore = process.listenerCount('SIGINT')
      const sigtermBefore = process.listenerCount('SIGTERM')

      const {close} = await run()

      expect(process.listenerCount('SIGINT')).toBe(sigintBefore + 1)
      expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore + 1)

      await close()

      expect(process.listenerCount('SIGINT')).toBe(sigintBefore)
      expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore)
    })

    test('re-raises the signal once teardown settles so the default exit runs', async () => {
      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true)
      vi.useFakeTimers()
      try {
        const appClose = vi.fn().mockResolvedValue(undefined)
        mockStartAppServer.mockResolvedValue({...mockAppServer({port: 3334}), close: appClose})

        await run()
        installedSignalHandler()('SIGINT')
        await vi.runAllTimersAsync()

        expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGINT')
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
        const hangingClose = vi.fn(() => new Promise<void>(() => {}))
        mockStartAppServer.mockResolvedValue({...mockAppServer({port: 3334}), close: hangingClose})

        await run()
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
})
