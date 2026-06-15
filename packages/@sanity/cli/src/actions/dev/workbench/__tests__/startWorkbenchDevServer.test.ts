import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  createDevOptions,
  createMockOutput,
  workbenchApp,
  workbenchCliConfig,
} from '../../__tests__/testHelpers.js'
import {startWorkbenchDevServer} from '../startWorkbenchDevServer.js'

const mockResolveLocalPackage = vi.hoisted(() => vi.fn())
const mockCreateServer = vi.hoisted(() => vi.fn())
const mockWriteWorkbenchRuntime = vi.hoisted(() => vi.fn())
const mockAcquireWorkbenchLock = vi.hoisted(() => vi.fn())
const mockGetRegisteredServers = vi.hoisted(() => vi.fn())
const mockWatchRegistry = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    resolveLocalPackage: mockResolveLocalPackage,
  }
})
vi.mock('vite', () => ({createServer: mockCreateServer}))
vi.mock('../writeWorkbenchRuntime.js', () => ({
  writeWorkbenchRuntime: mockWriteWorkbenchRuntime,
}))
vi.mock('../../registry/registry.js', () => ({
  acquireWorkbenchLock: mockAcquireWorkbenchLock,
  getRegisteredServers: mockGetRegisteredServers,
  watchRegistry: mockWatchRegistry,
}))

function createMockServer(port = 3333) {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    config: {server: {port}},
    httpServer: {address: vi.fn().mockReturnValue({address: '127.0.0.1', family: 'IPv4', port})},
    listen: vi.fn().mockResolvedValue(undefined),
    ws: {on: vi.fn(), send: vi.fn()},
  }
}

describe('startWorkbenchDevServer', () => {
  beforeEach(() => {
    mockWriteWorkbenchRuntime.mockResolvedValue('/tmp/sanity-project/.sanity/workbench')
    mockAcquireWorkbenchLock.mockReturnValue({
      acquired: true,
      lock: {release: vi.fn(), updatePort: vi.fn()},
    })
    mockGetRegisteredServers.mockReturnValue([])
    mockWatchRegistry.mockReturnValue({close: vi.fn()})
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  describe('federation gate', () => {
    test('skips workbench entirely when federation is not enabled', async () => {
      const result = await startWorkbenchDevServer(createDevOptions())

      expect(result.workbenchAvailable).toBe(false)
      expect(result.close).toBeTypeOf('function')
      expect(mockResolveLocalPackage).not.toHaveBeenCalled()
      expect(mockCreateServer).not.toHaveBeenCalled()
    })

    test('skips workbench when federation is explicitly disabled', async () => {
      const result = await startWorkbenchDevServer(createDevOptions({cliConfig: {}}))

      expect(result.workbenchAvailable).toBe(false)
      expect(result.close).toBeTypeOf('function')
      expect(mockResolveLocalPackage).not.toHaveBeenCalled()
    })

    test('returns httpHost and workbenchPort even when federation is disabled', async () => {
      const result = await startWorkbenchDevServer(
        createDevOptions({httpHost: '0.0.0.0', httpPort: 4000}),
      )

      expect(result.httpHost).toBe('0.0.0.0')
      expect(result.workbenchPort).toBe(4000)
    })
  })

  describe('workbench availability check', () => {
    test('returns workbenchAvailable: false when @sanity/workbench is not resolvable', async () => {
      mockResolveLocalPackage.mockRejectedValue(new Error('Cannot find package'))

      const result = await startWorkbenchDevServer(
        createDevOptions({cliConfig: workbenchCliConfig()}),
      )

      expect(result.workbenchAvailable).toBe(false)
      expect(result.close).toBeTypeOf('function')
      expect(mockCreateServer).not.toHaveBeenCalled()
    })

    test('returns httpHost and workbenchPort even when workbench is unavailable', async () => {
      mockResolveLocalPackage.mockRejectedValue(new Error('Cannot find package'))

      const result = await startWorkbenchDevServer(
        createDevOptions({
          cliConfig: workbenchCliConfig(),
          httpHost: '0.0.0.0',
          httpPort: 4000,
        }),
      )

      expect(result.httpHost).toBe('0.0.0.0')
      expect(result.workbenchPort).toBe(4000)
    })
  })

  describe('successful startup', () => {
    const federationConfig = {
      app: workbenchApp({organizationId: 'org-test'}),
    } as const

    test('returns workbenchAvailable: true and close when server starts', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      const result = await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      if (!result.close) throw new Error('Expected close to be defined')
      expect(result.workbenchAvailable).toBe(true)
      expect(result.close).toBeDefined()
    })

    test('returns httpHost and workbenchPort from provided options', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer(4000))

      const result = await startWorkbenchDevServer(
        createDevOptions({cliConfig: federationConfig, httpHost: '0.0.0.0', httpPort: 4000}),
      )

      expect(result.httpHost).toBe('0.0.0.0')
      expect(result.workbenchPort).toBe(4000)
    })

    test('returns actual port when Vite picks an alternative port', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      // Simulate Vite finding port 3333 occupied and binding to 3334 instead
      const mockServer = createMockServer(3334)
      mockServer.httpServer.address.mockReturnValue({
        address: '127.0.0.1',
        family: 'IPv4',
        port: 3334,
      })
      mockCreateServer.mockResolvedValue(mockServer)

      const result = await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      expect(result.workbenchPort).toBe(3334)
    })

    test('passes workDir to writeWorkbenchRuntime', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      expect(mockWriteWorkbenchRuntime).toHaveBeenCalledWith(
        expect.objectContaining({cwd: '/tmp/sanity-project'}),
      )
    })

    test('passes organizationId from cliConfig.app.organizationId', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(
        createDevOptions({
          cliConfig: {app: workbenchApp({organizationId: 'org-123'})},
        }),
      )

      expect(mockWriteWorkbenchRuntime).toHaveBeenCalledWith(
        expect.objectContaining({organizationId: 'org-123'}),
      )
    })

    test('throws a readable error when neither app.organizationId nor api.projectId is configured', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await expect(
        startWorkbenchDevServer(
          createDevOptions({cliConfig: {app: workbenchApp({organizationId: undefined})}}),
        ),
      ).rejects.toThrow(/Pass "organizationId" to unstable_defineApp/)
    })
  })

  describe('remote-preload Link header', () => {
    const federationConfig = {
      app: workbenchApp({organizationId: 'org-test'}),
    } as const

    function getMiddleware(): (req: {url?: string}, res: ResLike, next: () => void) => void {
      const calls = mockCreateServer.mock.calls
      const lastCall = calls.at(-1)
      if (!lastCall) throw new Error('createServer was not called')
      const config = lastCall[0] as {plugins: PluginLike[]}
      const plugin = config.plugins.find(
        (p) => p && typeof p === 'object' && p.name === 'sanity:workbench-remote-preload-header',
      )
      if (!plugin) throw new Error('remote-preload plugin not registered')
      const middlewareUse = vi.fn()
      plugin.configureServer?.({middlewares: {use: middlewareUse}})
      return middlewareUse.mock.calls[0][0]
    }

    interface ResLike {
      setHeader: (name: string, value: string) => void
    }

    interface PluginLike {
      configureServer?: (server: {middlewares: {use: (mw: unknown) => void}}) => void
      name?: string
    }

    test('does not register plugin when remoteUrl is not set', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      const config = mockCreateServer.mock.calls[0][0] as {plugins: PluginLike[]}
      expect(
        config.plugins.find((p) => p?.name === 'sanity:workbench-remote-preload-header'),
      ).toBeUndefined()
    })

    test('sets Link header on the root document', async () => {
      vi.stubEnv(
        'SANITY_INTERNAL_WORKBENCH_REMOTE_URL',
        'https://workbench.example/mf-manifest.json',
      )
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      const middleware = getMiddleware()
      const setHeader = vi.fn()
      const next = vi.fn()
      middleware({url: '/'}, {setHeader}, next)

      expect(setHeader).toHaveBeenCalledWith(
        'Link',
        '<https://workbench.example/mf-manifest.json>; rel=preload; as=fetch; crossorigin',
      )
      expect(next).toHaveBeenCalled()
    })

    test('sets Link header on /index.html', async () => {
      vi.stubEnv(
        'SANITY_INTERNAL_WORKBENCH_REMOTE_URL',
        'https://workbench.example/mf-manifest.json',
      )
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      const middleware = getMiddleware()
      const setHeader = vi.fn()
      middleware({url: '/index.html'}, {setHeader}, vi.fn())

      expect(setHeader).toHaveBeenCalledWith('Link', expect.stringContaining('as=fetch'))
    })

    test('ignores query strings when matching the index document', async () => {
      vi.stubEnv(
        'SANITY_INTERNAL_WORKBENCH_REMOTE_URL',
        'https://workbench.example/mf-manifest.json',
      )
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      const middleware = getMiddleware()
      const setHeader = vi.fn()
      middleware({url: '/?t=1'}, {setHeader}, vi.fn())

      expect(setHeader).toHaveBeenCalledWith('Link', expect.stringContaining('rel=preload'))
    })

    test('does not set Link header on non-document requests', async () => {
      vi.stubEnv(
        'SANITY_INTERNAL_WORKBENCH_REMOTE_URL',
        'https://workbench.example/mf-manifest.json',
      )
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      const middleware = getMiddleware()
      const setHeader = vi.fn()
      const next = vi.fn()
      middleware({url: '/workbench.js'}, {setHeader}, next)

      expect(setHeader).not.toHaveBeenCalled()
      expect(next).toHaveBeenCalled()
    })

    test('throws when remote URL is set but invalid', async () => {
      vi.stubEnv('SANITY_INTERNAL_WORKBENCH_REMOTE_URL', 'javascript:alert(1)')
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await expect(
        startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig})),
      ).rejects.toThrow(/Invalid SANITY_INTERNAL_WORKBENCH_REMOTE_URL/)
    })

    test('releases the lock when server creation throws', async () => {
      vi.stubEnv('SANITY_INTERNAL_WORKBENCH_REMOTE_URL', 'javascript:alert(1)')
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())
      const release = vi.fn()
      mockAcquireWorkbenchLock.mockReturnValue({
        acquired: true,
        lock: {release, updatePort: vi.fn()},
      })

      await expect(
        startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig})),
      ).rejects.toThrow()
      expect(release).toHaveBeenCalled()
    })

    test('releases the lock when writing runtime files throws', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())
      mockWriteWorkbenchRuntime.mockRejectedValue(new Error('EACCES: permission denied'))
      const release = vi.fn()
      mockAcquireWorkbenchLock.mockReturnValue({
        acquired: true,
        lock: {release, updatePort: vi.fn()},
      })

      await expect(
        startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig})),
      ).rejects.toThrow(/EACCES/)
      expect(release).toHaveBeenCalled()
    })

    test('accepts an http:// remote URL', async () => {
      vi.stubEnv(
        'SANITY_INTERNAL_WORKBENCH_REMOTE_URL',
        'http://workbench.example/mf-manifest.json',
      )
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      const middleware = getMiddleware()
      const setHeader = vi.fn()
      middleware({url: '/'}, {setHeader}, vi.fn())

      expect(setHeader).toHaveBeenCalledWith(
        'Link',
        '<http://workbench.example/mf-manifest.json>; rel=preload; as=fetch; crossorigin',
      )
    })
  })

  describe('reactStrictMode', () => {
    test('uses SANITY_STUDIO_REACT_STRICT_MODE=true env var over cliConfig', async () => {
      vi.stubEnv('SANITY_STUDIO_REACT_STRICT_MODE', 'true')
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(
        createDevOptions({
          cliConfig: {
            app: workbenchApp({organizationId: 'org-test'}),
            reactStrictMode: false,
          },
        }),
      )

      expect(mockWriteWorkbenchRuntime).toHaveBeenCalledWith(
        expect.objectContaining({reactStrictMode: true}),
      )
    })

    test('uses SANITY_STUDIO_REACT_STRICT_MODE=false env var over cliConfig', async () => {
      vi.stubEnv('SANITY_STUDIO_REACT_STRICT_MODE', 'false')
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(
        createDevOptions({
          cliConfig: {
            app: workbenchApp({organizationId: 'org-test'}),
            reactStrictMode: true,
          },
        }),
      )

      expect(mockWriteWorkbenchRuntime).toHaveBeenCalledWith(
        expect.objectContaining({reactStrictMode: false}),
      )
    })

    test('falls back to cliConfig.reactStrictMode when env var is not set', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(
        createDevOptions({
          cliConfig: {
            app: workbenchApp({organizationId: 'org-test'}),
            reactStrictMode: true,
          },
        }),
      )

      expect(mockWriteWorkbenchRuntime).toHaveBeenCalledWith(
        expect.objectContaining({reactStrictMode: true}),
      )
    })
  })

  describe('server startup failure', () => {
    const federationConfig = {
      app: workbenchApp({organizationId: 'org-test'}),
    } as const

    test('warns and returns without close when listen() throws', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      const mockServer = createMockServer()
      mockServer.listen.mockRejectedValue(new Error('Port already in use'))
      mockCreateServer.mockResolvedValue(mockServer)
      const output = createMockOutput()

      const result = await startWorkbenchDevServer(
        createDevOptions({cliConfig: federationConfig, output}),
      )

      expect(result.workbenchAvailable).toBe(false)
      expect(result.close).toBeTypeOf('function')
      expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('Port already in use'))
    })

    test('closes the server before returning when listen() throws', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      const mockServer = createMockServer()
      mockServer.listen.mockRejectedValue(new Error('Port already in use'))
      mockCreateServer.mockResolvedValue(mockServer)

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      expect(mockServer.close).toHaveBeenCalled()
    })
  })

  describe('singleton detection', () => {
    const federationConfig = {
      app: workbenchApp({organizationId: 'org-test'}),
    } as const

    test('skips starting server when lock is held by another process', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockAcquireWorkbenchLock.mockReturnValue({
        acquired: false,
        heldBy: {host: '0.0.0.0', pid: 12_345, port: 4000},
      })

      const result = await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      expect(result.workbenchAvailable).toBe(true)
      expect(result.workbenchPort).toBe(4000)
      expect(result.httpHost).toBe('0.0.0.0')
      expect(result.close).toBeTypeOf('function')
      expect(mockCreateServer).not.toHaveBeenCalled()
    })

    test('falls back to configured host/port when lock is held but lock file unreadable', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockAcquireWorkbenchLock.mockReturnValue({acquired: false, heldBy: undefined})

      const result = await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      expect(result.workbenchAvailable).toBe(true)
      expect(result.workbenchPort).toBe(3333)
      expect(result.httpHost).toBe('localhost')
      expect(mockCreateServer).not.toHaveBeenCalled()
    })
  })

  describe('registry integration', () => {
    const federationConfig = {
      app: workbenchApp({organizationId: 'org-test'}),
    } as const

    test('updates lock with actual port after successful startup', async () => {
      const mockUpdatePort = vi.fn()
      mockAcquireWorkbenchLock.mockReturnValue({
        acquired: true,
        lock: {release: vi.fn(), updatePort: mockUpdatePort},
      })
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer(3334))

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      expect(mockUpdatePort).toHaveBeenCalledWith(3334)
    })

    test('starts watching registry after successful startup', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      expect(mockWatchRegistry).toHaveBeenCalledWith(expect.any(Function))
    })

    test('watcher callback broadcasts applications via server.ws.send with inlined manifests', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      const mockServer = createMockServer()
      mockCreateServer.mockResolvedValue(mockServer)

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      const studioManifest = {createdAt: '2026-01-01T00:00:00.000Z', version: 3, workspaces: []}
      const appManifest = {icon: '<svg>two</svg>', title: 'App Two', version: '1'}

      const watchCallback = mockWatchRegistry.mock.calls[0][0]
      watchCallback([
        {
          host: 'localhost',
          id: 'app-1',
          manifest: studioManifest,
          pid: 2,
          port: 3334,
          type: 'studio',
        },
        {
          host: 'localhost',
          id: 'app-2',
          manifest: appManifest,
          pid: 3,
          port: 3335,
          type: 'coreApp',
        },
      ])

      expect(mockServer.ws.send).toHaveBeenCalledWith('sanity:workbench:local-applications', {
        applications: [
          {
            host: 'localhost',
            id: 'app-1',
            manifest: studioManifest,
            port: 3334,
            type: 'studio',
          },
          {
            host: 'localhost',
            id: 'app-2',
            manifest: appManifest,
            port: 3335,
            type: 'coreApp',
          },
        ],
      })
    })

    test('includes undefined manifest when a registered server has not yet extracted one', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      const mockServer = createMockServer()
      mockCreateServer.mockResolvedValue(mockServer)

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      const watchCallback = mockWatchRegistry.mock.calls[0][0]
      watchCallback([{host: 'localhost', pid: 2, port: 3334, type: 'studio'}])

      expect(mockServer.ws.send).toHaveBeenCalledWith('sanity:workbench:local-applications', {
        applications: [
          {
            host: 'localhost',
            id: undefined,
            manifest: undefined,
            port: 3334,
            type: 'studio',
          },
        ],
      })
    })

    test('forwards projectId from registry entries through the broadcast payload', async () => {
      // Workbench needs the projectId on the very first event to resolve a
      // local studio's primary project before the manifest arrives.
      mockResolveLocalPackage.mockResolvedValue({})
      const mockServer = createMockServer()
      mockCreateServer.mockResolvedValue(mockServer)

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      const watchCallback = mockWatchRegistry.mock.calls[0][0]
      watchCallback([
        {
          host: 'localhost',
          id: 'app-1',
          pid: 2,
          port: 3334,
          projectId: 'x1g7jygt',
          type: 'studio',
        },
      ])

      expect(mockServer.ws.send).toHaveBeenCalledWith('sanity:workbench:local-applications', {
        applications: [
          expect.objectContaining({
            host: 'localhost',
            id: 'app-1',
            port: 3334,
            projectId: 'x1g7jygt',
            type: 'studio',
          }),
        ],
      })
    })

    test('full-reloads the page when a running app gains or drops an interface', async () => {
      // Adding/removing a view or service rebuilds the app remote with new
      // exposes; module federation has the old remote-entry cached, so the page
      // must reload to re-fetch it. A soft reconcile would render an empty panel.
      mockResolveLocalPackage.mockResolvedValue({})
      const mockServer = createMockServer()
      mockCreateServer.mockResolvedValue(mockServer)

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))
      const watchCallback = mockWatchRegistry.mock.calls[0][0]

      const base = {host: 'localhost', id: 'app-1', pid: 3, port: 3335, type: 'coreApp'}
      const feed = {entry_point: './src/Feed.tsx', interface_type: 'panel', name: 'feed'}
      const alerts = {entry_point: './src/Alerts.tsx', interface_type: 'panel', name: 'alerts'}

      // First sighting of the app — reconcile softly, don't reload.
      watchCallback([{...base, interfaces: [feed]}])
      expect(mockServer.ws.send).toHaveBeenLastCalledWith(
        'sanity:workbench:local-applications',
        expect.anything(),
      )

      // A second panel is declared — the remote was rebuilt, reload the page.
      watchCallback([{...base, interfaces: [feed, alerts]}])
      expect(mockServer.ws.send).toHaveBeenLastCalledWith({type: 'full-reload'})
    })

    test('does not reload on a new app or a manifest-only change', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      const mockServer = createMockServer()
      mockCreateServer.mockResolvedValue(mockServer)

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))
      const watchCallback = mockWatchRegistry.mock.calls[0][0]

      const feed = {entry_point: './src/Feed.tsx', interface_type: 'panel', name: 'feed'}
      const base = {host: 'localhost', id: 'app-1', interfaces: [feed], pid: 3, port: 3335}

      watchCallback([{...base, manifest: {title: 'V1', version: '1'}, type: 'coreApp'}])
      // Same interface set, new title only — stay on the soft reconcile path.
      watchCallback([{...base, manifest: {title: 'V2', version: '1'}, type: 'coreApp'}])

      expect(mockServer.ws.send).not.toHaveBeenCalledWith({type: 'full-reload'})
      expect(mockServer.ws.send).toHaveBeenLastCalledWith(
        'sanity:workbench:local-applications',
        expect.anything(),
      )
    })

    test('responds to client request with current applications', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      const mockServer = createMockServer()
      mockCreateServer.mockResolvedValue(mockServer)
      const inlined = {icon: '<svg>inline</svg>', title: 'Title', version: '1'}
      mockGetRegisteredServers.mockReturnValue([
        {
          host: 'localhost',
          id: 'app-1',
          manifest: inlined,
          pid: 2,
          port: 3334,
          type: 'coreApp',
        },
      ])

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      const onCall = mockServer.ws.on.mock.calls.find(
        (args: unknown[]) => args[0] === 'sanity:workbench:get-local-applications',
      )
      expect(onCall).toBeDefined()

      const mockClient = {send: vi.fn()}
      const handler = onCall![1] as (data: unknown, client: typeof mockClient) => void
      handler(undefined, mockClient)

      expect(mockClient.send).toHaveBeenCalledWith('sanity:workbench:local-applications', {
        applications: [
          {
            host: 'localhost',
            id: 'app-1',
            manifest: inlined,
            port: 3334,
            type: 'coreApp',
          },
        ],
      })
    })

    test('close stops watcher and releases lock', async () => {
      const mockReleaseLock = vi.fn()
      const mockWatcherClose = vi.fn()
      mockAcquireWorkbenchLock.mockReturnValue({
        acquired: true,
        lock: {release: mockReleaseLock, updatePort: vi.fn()},
      })
      mockWatchRegistry.mockReturnValue({close: mockWatcherClose})
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      const result = await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))
      await result.close()

      expect(mockWatcherClose).toHaveBeenCalled()
      expect(mockReleaseLock).toHaveBeenCalled()
    })

    test('releases lock when server startup fails', async () => {
      const mockReleaseLock = vi.fn()
      mockAcquireWorkbenchLock.mockReturnValue({
        acquired: true,
        lock: {release: mockReleaseLock, updatePort: vi.fn()},
      })
      mockResolveLocalPackage.mockResolvedValue({})
      const mockServer = createMockServer()
      mockServer.listen.mockRejectedValue(new Error('Port already in use'))
      mockCreateServer.mockResolvedValue(mockServer)

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      expect(mockReleaseLock).toHaveBeenCalled()
    })
  })
})
