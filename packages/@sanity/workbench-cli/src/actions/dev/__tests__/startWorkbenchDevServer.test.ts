import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {startWorkbenchDevServer} from '../startWorkbenchDevServer.js'
import {
  createDevOptions,
  createMockOutput,
  createMockViteServer,
  mediaLibraryCliConfig,
  workbenchApp,
} from './devTestHelpers.js'

const mockCreateServer = vi.hoisted(() => vi.fn())
const mockWriteWorkbenchRuntime = vi.hoisted(() => vi.fn())
const mockAcquireWorkbenchLock = vi.hoisted(() => vi.fn())
const mockGetRegisteredServers = vi.hoisted(() => vi.fn())
const mockReadWorkbenchLock = vi.hoisted(() => vi.fn())
const mockWatchRegistry = vi.hoisted(() => vi.fn())

vi.mock('vite', () => ({createServer: mockCreateServer}))
vi.mock('@vitejs/plugin-react', () => ({default: vi.fn(() => [])}))
vi.mock('../writeWorkbenchRuntime.js', () => ({
  writeWorkbenchRuntime: mockWriteWorkbenchRuntime,
}))
// Registry/lock I/O is mocked; the pure `createExposesTracker` runs for
// real so the watcher's reload-vs-reconcile decision is exercised, not stubbed.
vi.mock('../registry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../registry.js')>()),
  acquireWorkbenchLock: mockAcquireWorkbenchLock,
  getRegisteredServers: mockGetRegisteredServers,
  readWorkbenchLock: mockReadWorkbenchLock,
  watchRegistry: mockWatchRegistry,
}))

describe('startWorkbenchDevServer', () => {
  beforeEach(() => {
    mockWriteWorkbenchRuntime.mockResolvedValue('/tmp/sanity-project/.sanity/workbench')
    mockAcquireWorkbenchLock.mockReturnValue({release: vi.fn(), updatePort: vi.fn()})
    mockGetRegisteredServers.mockReturnValue([])
    mockReadWorkbenchLock.mockReturnValue(undefined)
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
      expect(mockCreateServer).not.toHaveBeenCalled()
    })

    test('skips workbench when federation is explicitly disabled', async () => {
      const result = await startWorkbenchDevServer(createDevOptions({cliConfig: {}}))

      expect(result.workbenchAvailable).toBe(false)
      expect(result.close).toBeTypeOf('function')
    })

    test('returns httpHost and workbenchPort even when federation is disabled', async () => {
      const result = await startWorkbenchDevServer(
        createDevOptions({httpHost: '0.0.0.0', httpPort: 4000}),
      )

      expect(result.httpHost).toBe('0.0.0.0')
      expect(result.workbenchPort).toBe(4000)
    })
  })

  describe('config-only startup (media library)', () => {
    // A media library is a branded config, not an app. It's config-only (no
    // interfaces) and needs the workbench shell to render it, so the workbench
    // must still start — the gate must not bail as it does for a non-workbench
    // project.
    test('starts the workbench for a config-only project', async () => {
      mockCreateServer.mockResolvedValue(createMockViteServer())

      const result = await startWorkbenchDevServer(
        createDevOptions({cliConfig: mediaLibraryCliConfig()}),
      )

      expect(result.workbenchAvailable).toBe(true)
      expect(mockCreateServer).toHaveBeenCalled()
    })
  })

  describe('successful startup', () => {
    const federationConfig = {
      app: workbenchApp({organizationId: 'org-test'}),
    } as const

    test('returns workbenchAvailable: true and close when server starts', async () => {
      mockCreateServer.mockResolvedValue(createMockViteServer())

      const result = await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      if (!result.close) throw new Error('Expected close to be defined')
      expect(result.workbenchAvailable).toBe(true)
      expect(result.close).toBeDefined()
    })

    test('returns httpHost and workbenchPort from provided options', async () => {
      mockCreateServer.mockResolvedValue(createMockViteServer({port: 4000}))

      const result = await startWorkbenchDevServer(
        createDevOptions({cliConfig: federationConfig, httpHost: '0.0.0.0', httpPort: 4000}),
      )

      expect(result.httpHost).toBe('0.0.0.0')
      expect(result.workbenchPort).toBe(4000)
    })

    test('returns actual port when Vite picks an alternative port', async () => {
      // Simulate Vite finding port 3333 occupied and binding to 3334 instead
      const mockServer = createMockViteServer({port: 3334})
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
      mockCreateServer.mockResolvedValue(createMockViteServer())

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      expect(mockWriteWorkbenchRuntime).toHaveBeenCalledWith(
        expect.objectContaining({cwd: '/tmp/sanity-project'}),
      )
    })

    test('loads the private dashboard renderer without pre-bundling it', async () => {
      mockCreateServer.mockResolvedValue(createMockViteServer())

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      const config = mockCreateServer.mock.calls[0][0]
      expect(config.optimizeDeps.exclude).toEqual(['@sanity/workbench-cli/_internal_render'])
      expect(config.resolve.alias).toHaveProperty('@sanity/workbench-cli/_internal_render')
    })

    test('development mode forwards the SANITY_INTERNAL_WORKBENCH_REMOTE_URL override', async () => {
      mockCreateServer.mockResolvedValue(createMockViteServer())
      vi.stubEnv('SANITY_INTERNAL_WORKBENCH_REMOTE_URL', 'http://localhost:5173/mf-manifest.json')

      await startWorkbenchDevServer(
        createDevOptions({cliConfig: federationConfig, mode: 'development'}),
      )

      expect(mockWriteWorkbenchRuntime).toHaveBeenCalledWith(
        expect.objectContaining({remoteUrl: expect.stringContaining('localhost:5173')}),
      )
    })

    test('preview mode drops the dev override so the deployed workbench UI is used', async () => {
      mockCreateServer.mockResolvedValue(createMockViteServer())
      vi.stubEnv('SANITY_INTERNAL_WORKBENCH_REMOTE_URL', 'http://localhost:5173/mf-manifest.json')

      await startWorkbenchDevServer(
        createDevOptions({cliConfig: federationConfig, mode: 'preview'}),
      )

      expect(mockWriteWorkbenchRuntime).toHaveBeenCalledWith(
        expect.objectContaining({remoteUrl: undefined}),
      )
    })

    test('passes organizationId from cliConfig.app.organizationId', async () => {
      mockCreateServer.mockResolvedValue(createMockViteServer())

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
      mockCreateServer.mockResolvedValue(createMockViteServer())

      await expect(
        startWorkbenchDevServer(
          createDevOptions({cliConfig: {app: workbenchApp({organizationId: undefined})}}),
        ),
      ).rejects.toThrow(/Pass "organizationId" to defineApplication/)
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
      mockCreateServer.mockResolvedValue(createMockViteServer())

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
      mockCreateServer.mockResolvedValue(createMockViteServer())

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
      mockCreateServer.mockResolvedValue(createMockViteServer())

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
      mockCreateServer.mockResolvedValue(createMockViteServer())

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
      mockCreateServer.mockResolvedValue(createMockViteServer())

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
      mockCreateServer.mockResolvedValue(createMockViteServer())

      await expect(
        startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig})),
      ).rejects.toThrow(/Invalid SANITY_INTERNAL_WORKBENCH_REMOTE_URL/)
    })

    test('releases the lock when server creation throws', async () => {
      vi.stubEnv('SANITY_INTERNAL_WORKBENCH_REMOTE_URL', 'javascript:alert(1)')
      mockCreateServer.mockResolvedValue(createMockViteServer())
      const release = vi.fn()
      mockAcquireWorkbenchLock.mockReturnValue({release, updatePort: vi.fn()})

      await expect(
        startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig})),
      ).rejects.toThrow()
      expect(release).toHaveBeenCalled()
    })

    test('releases the lock when writing runtime files throws', async () => {
      mockCreateServer.mockResolvedValue(createMockViteServer())
      mockWriteWorkbenchRuntime.mockRejectedValue(new Error('EACCES: permission denied'))
      const release = vi.fn()
      mockAcquireWorkbenchLock.mockReturnValue({release, updatePort: vi.fn()})

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
      mockCreateServer.mockResolvedValue(createMockViteServer())

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
    // The env-var-vs-config resolution now lives in the CLI caller and is
    // injected; the server just forwards the resolved value to the runtime.
    test('forwards the injected reactStrictMode to the runtime template', async () => {
      mockCreateServer.mockResolvedValue(createMockViteServer())

      await startWorkbenchDevServer(
        createDevOptions({
          cliConfig: {app: workbenchApp({organizationId: 'org-test'})},
          reactStrictMode: true,
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
      const mockServer = createMockViteServer()
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
      const mockServer = createMockViteServer()
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
      mockAcquireWorkbenchLock.mockReturnValue(undefined)
      mockReadWorkbenchLock.mockReturnValue({host: '0.0.0.0', pid: 12_345, port: 4000})

      const result = await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      expect(result.workbenchAvailable).toBe(true)
      expect(result.workbenchPort).toBe(4000)
      expect(result.httpHost).toBe('0.0.0.0')
      expect(result.close).toBeTypeOf('function')
      expect(mockCreateServer).not.toHaveBeenCalled()
    })

    test('falls back to configured host/port when lock is held but lock file unreadable', async () => {
      mockAcquireWorkbenchLock.mockReturnValue(undefined)
      mockReadWorkbenchLock.mockReturnValue(undefined)

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
      mockAcquireWorkbenchLock.mockReturnValue({release: vi.fn(), updatePort: mockUpdatePort})
      mockCreateServer.mockResolvedValue(createMockViteServer({port: 3334}))

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      expect(mockUpdatePort).toHaveBeenCalledWith(3334)
    })

    test('starts watching registry after successful startup', async () => {
      mockCreateServer.mockResolvedValue(createMockViteServer())

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      expect(mockWatchRegistry).toHaveBeenCalledWith(expect.any(Function))
    })

    test('watcher callback broadcasts applications via server.ws.send with inlined manifests', async () => {
      const mockServer = createMockViteServer()
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
        configs: [],
      })
    })

    test('includes undefined manifest when a registered server has not yet extracted one', async () => {
      const mockServer = createMockViteServer()
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
        configs: [],
      })
    })

    test('forwards projectId from registry entries through the broadcast payload', async () => {
      // Workbench needs the projectId on the very first event to resolve a
      // local studio's primary project before the manifest arrives.
      const mockServer = createMockViteServer()
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
        configs: [],
      })
    })

    test('routes a config-only server (no interfaces) to configs, not applications', async () => {
      const mockServer = createMockViteServer()
      mockCreateServer.mockResolvedValue(mockServer)

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      const config = {
        appType: 'media-library',
        fields: [
          {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
        ],
      }
      const watchCallback = mockWatchRegistry.mock.calls[0][0]
      watchCallback([
        {host: 'localhost', id: 'app-1', pid: 2, port: 3334, type: 'studio'},
        {
          configs: [{...config, id: 'cfg-hash', moduleName: 'media-library', version: '1'}],
          host: 'localhost',
          pid: 3,
          port: 3337,
          type: 'coreApp',
        },
      ])

      expect(mockServer.ws.send).toHaveBeenCalledWith('sanity:workbench:local-applications', {
        applications: [expect.objectContaining({id: 'app-1', type: 'studio'})],
        configs: [
          {
            appType: 'media-library',
            config: {
              fields: [
                {
                  name: 'description',
                  public: true,
                  src: './src/description.ts',
                  title: 'Description',
                },
              ],
            },
            id: 'cfg-hash',
            moduleName: 'media-library',
            remoteURL: 'http://localhost:3337',
            version: '1',
          },
        ],
      })
    })

    test('forwards every interface kind to the remote in the exact wire shape (views keyed on type)', async () => {
      const mockServer = createMockViteServer()
      mockCreateServer.mockResolvedValue(mockServer)

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      const watchCallback = mockWatchRegistry.mock.calls[0][0]
      watchCallback([
        {
          host: 'localhost',
          id: 'app-1',
          interfaces: [
            {
              id: 'a-app',
              metadata: {dock: {group: 'dock.system', order: 1}},
              moduleId: 'App',
              name: 'main',
              src: './src/App.tsx',
              surface: 'window',
              title: 'Main',
              version: '1',
            },
            {
              id: 'a-panel',
              metadata: null,
              moduleId: 'views/feed',
              name: 'feed',
              src: './src/Feed.tsx',
              surface: 'panel',
              title: 'Feed',
              version: '1',
            },
            {
              id: 'a-asset',
              metadata: null,
              moduleId: 'views/lib',
              name: 'lib',
              src: './src/Lib.tsx',
              surface: 'asset_source',
              title: 'Lib',
              version: '1',
            },
            {
              id: 'a-tile',
              metadata: {order: 2, size: 'small'},
              moduleId: 'views/agent',
              name: 'agent',
              src: './src/Tile.tsx',
              surface: 'tile',
              title: 'Agent',
              version: '1',
            },
            {
              id: 'a-worker',
              metadata: null,
              moduleId: 'workers/sync',
              name: 'sync',
              src: './src/sync.ts',
              title: 'Sync',
              type: 'worker',
              version: '1',
            },
          ],
          pid: 3,
          port: 3337,
          type: 'coreApp',
        },
      ])

      const payload = mockServer.ws.send.mock.calls.at(-1)?.[1]
      expect(payload.applications[0].interfaces).toEqual([
        {
          id: 'a-app',
          metadata: {dock: {group: 'dock.system', order: 1}},
          moduleId: 'App',
          name: 'main',
          src: './src/App.tsx',
          title: 'Main',
          type: 'window',
          version: '1',
        },
        {
          id: 'a-panel',
          metadata: null,
          moduleId: 'views/feed',
          name: 'feed',
          src: './src/Feed.tsx',
          title: 'Feed',
          type: 'panel',
          version: '1',
        },
        {
          id: 'a-asset',
          metadata: null,
          moduleId: 'views/lib',
          name: 'lib',
          src: './src/Lib.tsx',
          title: 'Lib',
          type: 'asset_source',
          version: '1',
        },
        {
          id: 'a-tile',
          metadata: {order: 2, size: 'small'},
          moduleId: 'views/agent',
          name: 'agent',
          src: './src/Tile.tsx',
          title: 'Agent',
          type: 'tile',
          version: '1',
        },
        {
          id: 'a-worker',
          metadata: null,
          moduleId: 'workers/sync',
          name: 'sync',
          src: './src/sync.ts',
          title: 'Sync',
          type: 'worker',
          version: '1',
        },
      ])
    })

    test('a config server that also has interfaces lands in both channels', async () => {
      const mockServer = createMockViteServer()
      mockCreateServer.mockResolvedValue(mockServer)

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      const watchCallback = mockWatchRegistry.mock.calls[0][0]
      watchCallback([
        {
          configs: [{appType: 'media-library', fields: [], moduleName: 'media-library'}],
          host: 'localhost',
          id: 'app-1',
          interfaces: [{name: 'feed', src: './src/Feed.tsx', surface: 'panel', title: 'feed'}],
          pid: 3,
          port: 3337,
          type: 'coreApp',
        },
      ])

      const payload = mockServer.ws.send.mock.calls.at(-1)?.[1]
      expect(payload.applications).toEqual([
        expect.objectContaining({id: 'app-1', type: 'coreApp'}),
      ])
      expect(payload.configs).toEqual([
        expect.objectContaining({appType: 'media-library', moduleName: 'media-library'}),
      ])
    })

    test('full-reloads the page when a running app gains or drops an interface', async () => {
      // Adding/removing a view or service rebuilds the app remote with new
      // exposes; module federation has the old remote-entry cached, so the page
      // must reload to re-fetch it. A soft reconcile would render an empty panel.
      const mockServer = createMockViteServer()
      mockCreateServer.mockResolvedValue(mockServer)

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))
      const watchCallback = mockWatchRegistry.mock.calls[0][0]

      const base = {host: 'localhost', id: 'app-1', pid: 3, port: 3335, type: 'coreApp'}
      const feed = {name: 'feed', src: './src/Feed.tsx', surface: 'panel', title: 'feed'}
      const alerts = {name: 'alerts', src: './src/Alerts.tsx', surface: 'panel', title: 'alerts'}

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
      const mockServer = createMockViteServer()
      mockCreateServer.mockResolvedValue(mockServer)

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))
      const watchCallback = mockWatchRegistry.mock.calls[0][0]

      const feed = {name: 'feed', src: './src/Feed.tsx', surface: 'panel', title: 'feed'}
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
      const mockServer = createMockViteServer()
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
        configs: [],
      })
    })

    test('close stops watcher and releases lock', async () => {
      const mockReleaseLock = vi.fn()
      const mockWatcherClose = vi.fn()
      mockAcquireWorkbenchLock.mockReturnValue({release: mockReleaseLock, updatePort: vi.fn()})
      mockWatchRegistry.mockReturnValue({close: mockWatcherClose})
      mockCreateServer.mockResolvedValue(createMockViteServer())

      const result = await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))
      await result.close()

      expect(mockWatcherClose).toHaveBeenCalled()
      expect(mockReleaseLock).toHaveBeenCalled()
    })

    test('releases lock when server startup fails', async () => {
      const mockReleaseLock = vi.fn()
      mockAcquireWorkbenchLock.mockReturnValue({release: mockReleaseLock, updatePort: vi.fn()})
      const mockServer = createMockViteServer()
      mockServer.listen.mockRejectedValue(new Error('Port already in use'))
      mockCreateServer.mockResolvedValue(mockServer)

      await startWorkbenchDevServer(createDevOptions({cliConfig: federationConfig}))

      expect(mockReleaseLock).toHaveBeenCalled()
    })
  })
})
