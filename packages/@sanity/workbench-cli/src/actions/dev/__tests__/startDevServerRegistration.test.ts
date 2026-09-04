import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {unstable_defineMediaLibrary} from '../../../defineApp.js'
import {startDevServerRegistration} from '../startDevServerRegistration.js'
import {createMockOutput, workbenchApp, workbenchCliConfig} from './devTestHelpers.js'

const mockGetRegisteredServers = vi.hoisted(() => vi.fn())
const mockRegisterDevServer = vi.hoisted(() => vi.fn())
const mockStartDevManifestWatcher = vi.hoisted(() => vi.fn())
const mockExtractManifest = vi.hoisted(() => vi.fn())
const mockGetCliConfigUncached = vi.hoisted(() => vi.fn())

// The watcher re-reads the config to re-derive interfaces on each edit.
vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getCliConfigUncached: mockGetCliConfigUncached,
}))
// Only the registry I/O is mocked; `deriveInterfaces`/`trackExposesSet` are
// pure and run for real.
vi.mock('../registry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../registry.js')>()),
  getRegisteredServers: mockGetRegisteredServers,
  registerDevServer: mockRegisterDevServer,
}))
vi.mock('../startDevManifestWatcher.js', () => ({
  startDevManifestWatcher: mockStartDevManifestWatcher,
}))

function mockServer({
  boundPort,
  host,
  port = 3334,
}: {boundPort?: number; host?: boolean | string; port?: number} = {}) {
  return {
    config: {server: {host, port}},
    httpServer: {address: () => ({address: '127.0.0.1', family: 'IPv4', port: boundPort ?? port})},
  }
}

type RegistrationOptions = Parameters<typeof startDevServerRegistration>[0]

/** Run registration with sensible defaults; override only what a test asserts on. */
function register(overrides: Partial<RegistrationOptions> = {}) {
  return startDevServerRegistration({
    cliConfig: workbenchCliConfig(),
    extractManifest: mockExtractManifest,
    isApp: false,
    output: createMockOutput(),
    server: mockServer({port: 3334}) as any,
    workDir: '/tmp/sanity-project',
    ...overrides,
  })
}

describe('startDevServerRegistration', () => {
  beforeEach(() => {
    mockGetRegisteredServers.mockReturnValue([])
    mockRegisterDevServer.mockReturnValue({release: vi.fn(), update: vi.fn()})
    mockStartDevManifestWatcher.mockResolvedValue({close: vi.fn().mockResolvedValue(undefined)})
    mockExtractManifest.mockResolvedValue(undefined)
    mockGetCliConfigUncached.mockResolvedValue({app: workbenchApp()})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('registers studio in registry', async () => {
    await register({server: mockServer({port: 3334}) as any})

    expect(mockRegisterDevServer).toHaveBeenCalledWith(
      expect.objectContaining({host: 'localhost', port: 3334, type: 'studio'}),
    )
  })

  test('registers an app as a coreApp', async () => {
    await register({
      cliConfig: workbenchCliConfig({app: workbenchApp({entry: './src/App.tsx'})}),
      isApp: true,
    })

    expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({type: 'coreApp'}))
  })

  test('identifies the local app by its slug, not its deployment app id', async () => {
    await register()

    expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({id: 'test-app'}))
  })

  test('forwards local application metadata for the workbench to read', async () => {
    await register()

    expect(mockRegisterDevServer).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-123',
        slug: 'test-app',
        visibility: 'default',
      }),
    )
  })

  test('keys a config on its target app type, in its own id namespace', async () => {
    await register({
      cliConfig: workbenchCliConfig({
        app: unstable_defineMediaLibrary({
          fields: [{name: 'notes', src: './src/notes.ts', title: 'Notes'}],
          organizationId: 'org-1',
        }),
      }),
      isApp: true,
    })

    // A config never borrows the app slug — it registers under `config:${appType}`,
    // so it and the app it configures don't collide on one id.
    expect(mockRegisterDevServer).toHaveBeenCalledWith(
      expect.objectContaining({
        configs: [expect.objectContaining({appType: 'media-library'})],
        id: 'config:media-library',
      }),
    )
  })

  test('keeps the id when the server binds a port it did not ask for', async () => {
    await register({server: mockServer({boundPort: 3339, port: 3334}) as any})

    expect(mockRegisterDevServer).toHaveBeenCalledWith(
      expect.objectContaining({id: 'test-app', port: 3339}),
    )
  })

  test('logs an error and keeps the dev server up when another server already holds the id', async () => {
    mockGetRegisteredServers.mockReturnValue([{id: 'test-app', pid: 4242, port: 3334}])
    const output = createMockOutput()

    const handle = await register({output})

    // A plain duplicate-id conflict, phrased generically — a config and its app
    // no longer share an id, so there is no role to disambiguate.
    expect(output.error).toHaveBeenCalledWith(
      expect.stringContaining('"test-app" is already served'),
      {exit: false},
    )
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('Stop that server first.'), {
      exit: false,
    })
    // Nothing registered, so the workbench never sees it — and nothing to watch or release.
    expect(mockRegisterDevServer).not.toHaveBeenCalled()
    expect(mockStartDevManifestWatcher).not.toHaveBeenCalled()
    await expect(handle.close()).resolves.toBeUndefined()
  })

  test('registers when a live dev server holds a different id', async () => {
    mockGetRegisteredServers.mockReturnValue([{id: 'other-app', pid: 4242, port: 3334}])
    const output = createMockOutput()

    await register({output})

    expect(output.error).not.toHaveBeenCalled()
    expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({id: 'test-app'}))
  })

  test('forwards api.projectId to registerDevServer', async () => {
    await register({cliConfig: {api: {projectId: 'x1g7jygt'}, app: workbenchApp()} as any})

    expect(mockRegisterDevServer).toHaveBeenCalledWith(
      expect.objectContaining({projectId: 'x1g7jygt'}),
    )
  })

  test('registers multiple panel views', async () => {
    const output = createMockOutput()
    const handle = await register({
      cliConfig: workbenchCliConfig({
        app: workbenchApp({
          views: [
            {name: 'feed', src: './src/Feed.tsx', surface: 'panel', title: 'feed'},
            {name: 'inbox', src: './src/Inbox.tsx', surface: 'panel', title: 'inbox'},
          ],
        }),
      }),
      output,
    })

    expect(handle.close).toBeInstanceOf(Function)
    expect(mockRegisterDevServer).toHaveBeenCalledWith(
      expect.objectContaining({
        interfaces: expect.arrayContaining([
          expect.objectContaining({name: 'feed', surface: 'panel'}),
          expect.objectContaining({name: 'inbox', surface: 'panel'}),
        ]),
      }),
    )
    expect(output.warn).not.toHaveBeenCalled()
    expect(output.error).not.toHaveBeenCalled()
  })

  test('omits projectId when api.projectId is not configured', async () => {
    await register()

    const [registerArg] = mockRegisterDevServer.mock.calls[0]
    expect(registerArg.projectId).toBeUndefined()
  })

  test('registers without icon/title — they are derived from the inlined manifest', async () => {
    await register()

    const [registerArg] = mockRegisterDevServer.mock.calls[0]
    expect(registerArg).not.toHaveProperty('icon')
    expect(registerArg).not.toHaveProperty('title')
  })

  test('registers app under the host applied by the vite dev server', async () => {
    await register({server: mockServer({host: 'mydev.local', port: 3334}) as any})

    expect(mockRegisterDevServer).toHaveBeenCalledWith(
      expect.objectContaining({host: 'mydev.local'}),
    )
  })

  test('falls back to localhost when the vite server host is not a string', async () => {
    await register({server: mockServer({host: true, port: 3334}) as any})

    expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({host: 'localhost'}))
  })

  test('registers app type when isApp is true', async () => {
    await register({isApp: true})

    expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({type: 'coreApp'}))
  })

  test('starts the manifest watcher for studios', async () => {
    await register({isApp: false})

    expect(mockStartDevManifestWatcher).toHaveBeenCalledWith(
      expect.objectContaining({
        // The studio project root resolves to sanity.config.*, but views/
        // Web workers live in sanity.cli.* — the watcher must react to both.
        extraWatchFilenames: ['sanity.cli.js', 'sanity.cli.ts'],
        workDir: '/tmp/sanity-project',
      }),
    )
  })

  test('starts the manifest watcher for core apps', async () => {
    await register({isApp: true})

    expect(mockStartDevManifestWatcher).toHaveBeenCalledWith(
      expect.objectContaining({extract: expect.any(Function), workDir: '/tmp/sanity-project'}),
    )
    // App roots already resolve to sanity.cli.* — no extra filenames needed.
    expect(mockStartDevManifestWatcher.mock.calls[0][0].extraWatchFilenames).toBeUndefined()
  })

  test('wires the injected extractManifest into the watcher and re-derives interfaces alongside it', async () => {
    const manifest = {icon: '<svg><path d="M0 0"/></svg>', title: 'My App', version: '1'}
    mockExtractManifest.mockResolvedValue(manifest)
    // A fresh config read with a panel → the watcher re-derives + forwards it
    // alongside the manifest (which stays pure).
    mockGetCliConfigUncached.mockResolvedValue({
      app: workbenchApp({
        views: [{name: 'feed', src: './src/FeedPanel.tsx', surface: 'panel', title: 'feed'}],
      }),
    })

    await register({isApp: true})

    const {extract} = mockStartDevManifestWatcher.mock.calls[0][0]
    const params = {configPath: '/tmp/sanity-project/sanity.cli.ts', workDir: '/tmp/sanity-project'}
    await expect(extract(params)).resolves.toEqual({
      configs: [],
      interfaces: [
        {
          id: 'test-app-panel-feed',
          metadata: null,
          moduleId: 'views/feed',
          name: 'feed',
          src: './src/FeedPanel.tsx',
          surface: 'panel',
          title: 'feed',
          version: '1',
        },
      ],
      manifest,
    })
    expect(mockExtractManifest).toHaveBeenCalledWith({...params, applicationId: 'test-app'})
  })

  test('calls manifest cleanup on close', async () => {
    const mockCleanup = vi.fn()
    mockRegisterDevServer.mockReturnValue({release: mockCleanup, update: vi.fn()})

    const result = await register()

    await result.close()
    expect(mockCleanup).toHaveBeenCalled()
  })

  test('propagates error when registerDevServer throws', async () => {
    const error = new Error('Registry write failed')
    mockRegisterDevServer.mockImplementation(() => {
      throw error
    })

    await expect(register()).rejects.toThrow(error)
  })

  test('propagates error when startDevManifestWatcher rejects', async () => {
    const error = new Error('Watcher setup failed')
    mockStartDevManifestWatcher.mockRejectedValue(error)

    await expect(register()).rejects.toThrow(error)
  })

  // `entry` declares an SDK app's navigable `window` view.
  test('forwards a `window` interface derived from `entry` for an SDK app', async () => {
    await register({cliConfig: {app: workbenchApp({entry: './src/App.tsx'})} as any, isApp: true})

    expect(mockRegisterDevServer).toHaveBeenCalledWith(
      expect.objectContaining({
        interfaces: expect.arrayContaining([
          {
            id: 'test-app-window-test-app',
            metadata: null,
            moduleId: 'App',
            name: 'test-app',
            src: './src/App.tsx',
            surface: 'window',
            title: 'Test App',
          },
        ]),
      }),
    )
  })

  test('forwards no `window` interface when an SDK app declares no `entry`', async () => {
    await register({cliConfig: {app: workbenchApp()} as any, isApp: true})

    const {interfaces} = mockRegisterDevServer.mock.calls[0][0]
    expect((interfaces ?? []).some((i: {surface?: string}) => i.surface === 'window')).toBe(false)
  })

  test('rejects a studio that declares `entry` — app views for studios are not implemented yet', async () => {
    await expect(
      register({cliConfig: {app: workbenchApp({entry: './src/App.tsx'})} as any, isApp: false}),
    ).rejects.toThrow('App views for studios are not implemented yet')
  })

  // Adding/removing a view or service must rebuild the federation remote so the
  // new interface gets an expose + artifact. The watcher drives it.
  const feed = {name: 'feed', src: './src/Feed.tsx', surface: 'panel', title: 'feed'}

  test('rebuilds the remote when the interface set changes, then keeps quiet on a repeat', async () => {
    const onInterfaceSetChange = vi.fn().mockResolvedValue(undefined)
    const update = vi.fn()
    mockRegisterDevServer.mockReturnValue({release: vi.fn(), update})

    await register({cliConfig: {app: workbenchApp()} as any, isApp: true, onInterfaceSetChange})
    const watcherUpdate = mockStartDevManifestWatcher.mock.calls[0][0].update

    // A panel appears → rebuild, then patch the registry.
    await watcherUpdate({interfaces: [feed], manifest: undefined, manifestUpdatedAt: 'a'})
    expect(onInterfaceSetChange).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(1)

    // Same set on the next pass → no rebuild, registry still patched.
    await watcherUpdate({interfaces: [feed], manifest: undefined, manifestUpdatedAt: 'b'})
    expect(onInterfaceSetChange).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(2)
  })

  test('does not rebuild when only the manifest changes (same interface set)', async () => {
    const onInterfaceSetChange = vi.fn().mockResolvedValue(undefined)
    mockRegisterDevServer.mockReturnValue({release: vi.fn(), update: vi.fn()})

    await register({
      cliConfig: {
        app: workbenchApp({
          views: [{name: 'feed', src: './src/Feed.tsx', surface: 'panel', title: 'feed'}],
        }),
      } as any,
      isApp: true,
      onInterfaceSetChange,
    })
    const watcherUpdate = mockStartDevManifestWatcher.mock.calls[0][0].update

    // Same interfaces as the initial registration; only title/icon moved.
    await watcherUpdate({
      interfaces: [feed],
      manifest: {title: 'Renamed', version: '1'},
      manifestUpdatedAt: 'a',
    })
    expect(onInterfaceSetChange).not.toHaveBeenCalled()
  })

  test('retries the rebuild on the next pass when it fails — the registry stays unpatched in between', async () => {
    const onInterfaceSetChange = vi
      .fn()
      // e.g. the recreated server never came up (organizationId removed)
      .mockRejectedValueOnce(new Error('Dev server did not restart after the view/service change'))
      .mockResolvedValueOnce(mockServer({port: 3334}))
    const update = vi.fn()
    mockRegisterDevServer.mockReturnValue({release: vi.fn(), update})

    await register({cliConfig: {app: workbenchApp()} as any, isApp: true, onInterfaceSetChange})
    const watcherUpdate = mockStartDevManifestWatcher.mock.calls[0][0].update

    // The failure must reach the watcher (it owns the warning), and the
    // registry must not advertise the new set on a server that never came back.
    await expect(
      watcherUpdate({interfaces: [feed], manifest: undefined, manifestUpdatedAt: 'a'}),
    ).rejects.toThrow('Dev server did not restart')
    expect(update).not.toHaveBeenCalled()

    // Same declarations on the next save: the set id was not committed by the
    // failed pass, so the rebuild runs again instead of being skipped.
    await watcherUpdate({interfaces: [feed], manifest: undefined, manifestUpdatedAt: 'b'})
    expect(onInterfaceSetChange).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledTimes(1)
  })

  test('patches the registry with the rebuilt server address after an interface-set change', async () => {
    // Non-strict ports: the recreated server can land on a different port than
    // the one captured at initial registration.
    const onInterfaceSetChange = vi
      .fn()
      .mockResolvedValue(mockServer({host: 'mydev.local', port: 4444}))
    const update = vi.fn()
    mockRegisterDevServer.mockReturnValue({release: vi.fn(), update})

    await register({cliConfig: {app: workbenchApp()} as any, isApp: true, onInterfaceSetChange})
    const watcherUpdate = mockStartDevManifestWatcher.mock.calls[0][0].update

    await watcherUpdate({interfaces: [feed], manifest: undefined, manifestUpdatedAt: 'a'})
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({host: 'mydev.local', interfaces: [feed], port: 4444}),
    )

    // A manifest-only pass (same set) must not rewrite the address.
    await watcherUpdate({interfaces: [feed], manifest: undefined, manifestUpdatedAt: 'b'})
    expect(update).toHaveBeenLastCalledWith(expect.not.objectContaining({host: expect.anything()}))
  })

  test('still patches the registry when no rebuild handler is passed', async () => {
    const update = vi.fn()
    mockRegisterDevServer.mockReturnValue({release: vi.fn(), update})

    await register({cliConfig: {app: workbenchApp()} as any, isApp: true})
    const watcherUpdate = mockStartDevManifestWatcher.mock.calls[0][0].update

    // The set changed but no handler was passed (e.g. studios) — no crash, and
    // the registry patch still goes through.
    await watcherUpdate({interfaces: [feed], manifest: undefined, manifestUpdatedAt: 'a'})
    expect(update).toHaveBeenCalledTimes(1)
  })
})
