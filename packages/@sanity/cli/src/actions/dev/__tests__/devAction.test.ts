import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {devAction} from '../devAction.js'
import {createDevOptions, createMockOutput} from './testHelpers.js'

const mockStartWorkbenchDevServer = vi.hoisted(() => vi.fn())
const mockStartAppDevServer = vi.hoisted(() => vi.fn())
const mockStartStudioDevServer = vi.hoisted(() => vi.fn())
const mockRegisterDevServer = vi.hoisted(() => vi.fn())
const mockStartDevManifestWatcher = vi.hoisted(() => vi.fn())
const mockExtractCoreAppManifest = vi.hoisted(() => vi.fn())

vi.mock('../startWorkbenchDevServer.js', () => ({
  startWorkbenchDevServer: mockStartWorkbenchDevServer,
}))
vi.mock('../startAppDevServer.js', () => ({
  startAppDevServer: mockStartAppDevServer,
}))
vi.mock('../startStudioDevServer.js', () => ({
  startStudioDevServer: mockStartStudioDevServer,
}))
vi.mock('../devServerRegistry.js', () => ({
  registerDevServer: mockRegisterDevServer,
}))
vi.mock('../startDevManifestWatcher.js', () => ({
  startDevManifestWatcher: mockStartDevManifestWatcher,
}))
vi.mock('../../manifest/extractCoreAppManifest.js', () => ({
  extractCoreAppManifest: mockExtractCoreAppManifest,
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
    // Default: no workbench (federation disabled)
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      httpHost: 'localhost',
      workbenchAvailable: false,
      workbenchPort: 3333,
    })
    mockRegisterDevServer.mockReturnValue({release: vi.fn(), update: vi.fn()})
    mockStartDevManifestWatcher.mockResolvedValue({close: vi.fn().mockResolvedValue(undefined)})
    mockExtractCoreAppManifest.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('studio mode without workbench uses original port', async () => {
    mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3333}))

    await devAction(createDevOptions())

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

    await devAction(createDevOptions({output}))

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

    await devAction(createDevOptions({isApp: true}))

    expect(mockStartAppDevServer).toHaveBeenCalled()
    expect(mockStartStudioDevServer).not.toHaveBeenCalled()
  })

  test('passes reactRefreshHost pointing to workbench when workbench is running', async () => {
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      httpHost: 'localhost',
      workbenchAvailable: true,
      workbenchPort: 3333,
    })
    mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))

    await devAction(createDevOptions())

    expect(mockStartStudioDevServer).toHaveBeenCalledWith(
      expect.objectContaining({reactRefreshHost: 'http://localhost:3333'}),
    )
  })

  test('does not pass reactRefreshHost when workbench is not running', async () => {
    mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3333}))

    await devAction(createDevOptions())

    expect(mockStartStudioDevServer).toHaveBeenCalledWith(
      expect.objectContaining({reactRefreshHost: undefined}),
    )
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

    const thrown = await devAction(createDevOptions()).catch((err) => err)

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

    const result = await devAction(createDevOptions())

    await expect(result.close()).resolves.toBeUndefined()
    expect(mockWorkbenchClose).toHaveBeenCalled()
    expect(mockAppClose).toHaveBeenCalled()
  })

  describe('registry integration', () => {
    test('registers studio in registry when federation is enabled', async () => {
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))

      await devAction(
        createDevOptions({
          cliConfig: {federation: {enabled: true}},
        }),
      )

      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 3334,
          type: 'studio',
        }),
      )
    })

    test('passes deployment.appId to registerDevServer', async () => {
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))

      await devAction(
        createDevOptions({
          cliConfig: {deployment: {appId: 'app-abc'}, federation: {enabled: true}},
        }),
      )

      expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({id: 'app-abc'}))
    })

    test('warns about deprecated app.id and falls back to it when registering', async () => {
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))
      const output = createMockOutput()

      await devAction(
        createDevOptions({
          cliConfig: {app: {id: 'legacy-app'}, federation: {enabled: true}},
          output,
        }),
      )

      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.objectContaining({id: 'legacy-app'}),
      )
      expect(output.warn).toHaveBeenCalledWith(
        expect.stringContaining('`app.id` config has moved to `deployment.appId`'),
      )
    })

    test('errors out when both app.id and deployment.appId are set', async () => {
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))
      const output = createMockOutput()

      await devAction(
        createDevOptions({
          cliConfig: {
            app: {id: 'legacy-app'},
            deployment: {appId: 'new-app'},
            federation: {enabled: true},
          },
          output,
        }),
      )

      expect(output.error).toHaveBeenCalledWith(
        expect.stringContaining('Found both app.id (deprecated) and deployment.appId'),
        expect.objectContaining({exit: 1}),
      )
    })

    test('registers without icon/title — they are derived from the inlined manifest', async () => {
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))

      await devAction(createDevOptions({cliConfig: {federation: {enabled: true}}}))

      const [registerArg] = mockRegisterDevServer.mock.calls[0]
      expect(registerArg).not.toHaveProperty('icon')
      expect(registerArg).not.toHaveProperty('title')
      expect(registerArg.id).toBeUndefined()
    })

    test('registers app under the host applied by the vite dev server', async () => {
      // The resolved host on `server.config.server.host` reflects the final,
      // user-merged Vite config — use that as the authoritative source.
      mockStartStudioDevServer.mockResolvedValue(mockServer({host: 'mydev.local', port: 3334}))

      await devAction(
        createDevOptions({
          cliConfig: {federation: {enabled: true}, server: {hostname: 'mydev.local'}},
        }),
      )

      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.objectContaining({host: 'mydev.local'}),
      )
    })

    test('registered host reflects the vite server even when user vite config overrides the cli config', async () => {
      // User's vite config set `server.host` to 'app.local' — that wins over
      // the cli config's `server.hostname`. The registered host must follow
      // the vite server's resolved config, not the cli config.
      mockStartStudioDevServer.mockResolvedValue(mockServer({host: 'app.local', port: 3334}))

      await devAction(
        createDevOptions({
          cliConfig: {federation: {enabled: true}, server: {hostname: 'cli-config.local'}},
        }),
      )

      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.objectContaining({host: 'app.local'}),
      )
    })

    test('falls back to localhost when the vite server host is not a string', async () => {
      // `server.host: true` (bind to all interfaces) is not a usable URL host.
      mockStartStudioDevServer.mockResolvedValue(mockServer({host: true, port: 3334}))

      await devAction(createDevOptions({cliConfig: {federation: {enabled: true}}}))

      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.objectContaining({host: 'localhost'}),
      )
    })

    test('registers app type when isApp is true', async () => {
      mockStartAppDevServer.mockResolvedValue(mockServer({port: 3334}))

      await devAction(
        createDevOptions({
          cliConfig: {federation: {enabled: true}},
          isApp: true,
        }),
      )

      expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({type: 'coreApp'}))
    })

    test('does not register when federation is disabled', async () => {
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3333}))

      await devAction(createDevOptions())

      expect(mockRegisterDevServer).not.toHaveBeenCalled()
    })

    test('does not start the manifest watcher when federation is disabled', async () => {
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3333}))

      await devAction(createDevOptions())

      expect(mockStartDevManifestWatcher).not.toHaveBeenCalled()
    })

    test('starts the manifest watcher for studios when federation is enabled', async () => {
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))

      await devAction(createDevOptions({cliConfig: {federation: {enabled: true}}}))

      expect(mockStartDevManifestWatcher).toHaveBeenCalledWith(
        expect.objectContaining({workDir: '/tmp/sanity-project'}),
      )
    })

    test('does not start the manifest watcher for core apps — they have no schema to keep in sync', async () => {
      mockStartAppDevServer.mockResolvedValue(mockServer({port: 3334}))

      await devAction(
        createDevOptions({
          cliConfig: {federation: {enabled: true}},
          isApp: true,
        }),
      )

      expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({type: 'coreApp'}))
      expect(mockStartDevManifestWatcher).not.toHaveBeenCalled()
    })

    test('registers the core-app immediately with no manifest — startup is not blocked on extraction', async () => {
      mockStartAppDevServer.mockResolvedValue(mockServer({port: 3334}))
      // Never resolves — simulates a slow extraction. devAction must still return.
      mockExtractCoreAppManifest.mockReturnValue(new Promise(() => {}))

      await devAction(createDevOptions({cliConfig: {federation: {enabled: true}}, isApp: true}))

      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.not.objectContaining({manifest: expect.anything()}),
      )
    })

    test('patches the registry with the core-app manifest once extraction completes', async () => {
      const appManifest = {icon: '<svg><path d="M0 0"/></svg>', title: 'My App', version: '1'}
      const mockUpdate = vi.fn()
      mockRegisterDevServer.mockReturnValue({release: vi.fn(), update: mockUpdate})
      mockExtractCoreAppManifest.mockResolvedValue(appManifest)
      mockStartAppDevServer.mockResolvedValue(mockServer({port: 3334}))

      await devAction(createDevOptions({cliConfig: {federation: {enabled: true}}, isApp: true}))

      await vi.waitFor(() => expect(mockUpdate).toHaveBeenCalled())
      expect(mockExtractCoreAppManifest).toHaveBeenCalledWith({workDir: '/tmp/sanity-project'})
      expect(mockUpdate).toHaveBeenCalledWith({
        manifest: appManifest,
        manifestUpdatedAt: expect.any(String),
      })
    })

    test('warns and does not patch the registry when core-app extraction fails', async () => {
      mockExtractCoreAppManifest.mockRejectedValue(new Error('bad config'))
      const mockUpdate = vi.fn()
      mockRegisterDevServer.mockReturnValue({release: vi.fn(), update: mockUpdate})
      mockStartAppDevServer.mockResolvedValue(mockServer({port: 3334}))
      const output = createMockOutput()

      await devAction(
        createDevOptions({cliConfig: {federation: {enabled: true}}, isApp: true, output}),
      )

      await vi.waitFor(() => expect(output.warn).toHaveBeenCalled())
      expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('bad config'))
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    test('does not extract the core-app manifest for studios', async () => {
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))

      await devAction(createDevOptions({cliConfig: {federation: {enabled: true}}}))

      expect(mockExtractCoreAppManifest).not.toHaveBeenCalled()
    })

    test('registers the studio immediately with no manifest — the watcher owns extraction', async () => {
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))

      await devAction(createDevOptions({cliConfig: {federation: {enabled: true}}}))

      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.not.objectContaining({manifest: expect.anything()}),
      )
      expect(mockStartDevManifestWatcher).toHaveBeenCalledWith(
        expect.objectContaining({update: expect.any(Function), workDir: '/tmp/sanity-project'}),
      )
    })

    test('calls manifest cleanup on close', async () => {
      const mockCleanup = vi.fn()
      mockRegisterDevServer.mockReturnValue({release: mockCleanup, update: vi.fn()})
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))

      const result = await devAction(createDevOptions({cliConfig: {federation: {enabled: true}}}))

      await result.close()
      expect(mockCleanup).toHaveBeenCalled()
    })

    test('close removes signal handlers to prevent listener leaks', async () => {
      const offSpy = vi.spyOn(process, 'off')
      mockRegisterDevServer.mockReturnValue({release: vi.fn(), update: vi.fn()})
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))

      const result = await devAction(createDevOptions({cliConfig: {federation: {enabled: true}}}))
      await result.close()

      expect(offSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function))
      expect(offSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function))

      offSpy.mockRestore()
    })

    test('SIGINT handler cleans up manifest and workbench, and removes itself', async () => {
      const mockCleanup = vi.fn()
      const mockWorkbenchClose = vi.fn().mockResolvedValue(undefined)
      mockRegisterDevServer.mockReturnValue({release: mockCleanup, update: vi.fn()})
      mockStartWorkbenchDevServer.mockResolvedValue({
        close: mockWorkbenchClose,
        httpHost: 'localhost',
        workbenchAvailable: true,
        workbenchPort: 3333,
      })
      mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3334}))

      const onSpy = vi.spyOn(process, 'on')
      const offSpy = vi.spyOn(process, 'off')

      const result = await devAction(createDevOptions({cliConfig: {federation: {enabled: true}}}))

      // Grab the registered SIGINT handler (first call matching 'SIGINT')
      const sigintCall = onSpy.mock.calls.find(([ev]) => ev === 'SIGINT')
      expect(sigintCall).toBeDefined()
      const handler = sigintCall![1] as () => void

      // Invoke the handler directly — simulates the OS delivering SIGINT
      handler()

      expect(mockCleanup).toHaveBeenCalled()
      expect(mockWorkbenchClose).toHaveBeenCalled()
      expect(offSpy).toHaveBeenCalledWith('SIGINT', handler)
      expect(offSpy).toHaveBeenCalledWith('SIGTERM', handler)

      // Prevent the close teardown from double-invoking the handlers we just removed
      await result.close()
      onSpy.mockRestore()
      offSpy.mockRestore()
    })
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

    const result = await devAction(createDevOptions({isApp: true}))

    expect(result.close).toBeDefined()
    // The close must still tear down the workbench server
    await result.close()
    expect(mockWorkbenchClose).toHaveBeenCalled()
    // No registration should have happened because federation wasn't evaluated
    expect(mockRegisterDevServer).not.toHaveBeenCalled()
  })
})
