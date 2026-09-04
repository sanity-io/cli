import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {unstable_defineMediaLibrary} from '../../../defineApp.js'
import {getRegisteredServers} from '../registry.js'
import {startDevServerRegistration} from '../startDevServerRegistration.js'
import {createMockOutput, workbenchApp, workbenchCliConfig} from './devTestHelpers.js'

const mockStartDevManifestWatcher = vi.hoisted(() => vi.fn())
const mockExtractManifest = vi.hoisted(() => vi.fn())
const mockGetCliConfigUncached = vi.hoisted(() => vi.fn())

// A fresh in-memory `node:fs` for this file (see ./fsMock.ts): own state per
// file, reset per test, so the real `registerDevServer`/`getRegisteredServers`
// run with no disk I/O and tests assert the persisted manifest.
const fsMock = await vi.hoisted(async () => (await import('./fsMock.js')).createFsMock())

vi.mock('node:fs', () => fsMock.module)

const mockGetSanityDataDir = vi.hoisted(() => vi.fn())
// The watcher re-reads the config to re-derive interfaces on each edit.
vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getCliConfigUncached: mockGetCliConfigUncached,
  getSanityDataDir: mockGetSanityDataDir,
}))
// The registry's liveness/PID-reuse logic is a mocked seam so read-back keeps
// our own freshly written entry (exercised for real in processLiveness.test.ts).
vi.mock('../processLiveness.js', () => ({
  __resetStartTimeCacheForTesting: vi.fn(),
  getProcessStartTime: vi.fn(() => undefined),
  isOurProcess: vi.fn((pid: number) => pid === process.pid),
}))
vi.mock('../startDevManifestWatcher.js', () => ({
  startDevManifestWatcher: mockStartDevManifestWatcher,
}))

const DATA_DIR = '/tmp/sanity-data'
const REGISTRY_DIR = join(DATA_DIR, 'dev-servers')
const manifestPath = () => join(REGISTRY_DIR, `${process.pid}.json`)

/** The manifest the registry persisted for this process — what the workbench reads. */
const readManifest = () => JSON.parse(fsMock.files.get(manifestPath())!)

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
    fsMock.reset()
    mockGetSanityDataDir.mockReturnValue(DATA_DIR)
    mockStartDevManifestWatcher.mockResolvedValue({close: vi.fn().mockResolvedValue(undefined)})
    mockExtractManifest.mockResolvedValue(undefined)
    mockGetCliConfigUncached.mockResolvedValue({app: workbenchApp()})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('registers studio in registry', async () => {
    await register({server: mockServer({port: 3334}) as any})

    expect(readManifest()).toMatchObject({host: 'localhost', port: 3334, type: 'studio'})
  })

  test('registers an app as a coreApp', async () => {
    await register({
      cliConfig: workbenchCliConfig({app: workbenchApp({entry: './src/App.tsx'})}),
      isApp: true,
    })

    expect(readManifest().type).toBe('coreApp')
  })

  test('identifies the local app by its slug, not its deployment app id', async () => {
    await register()

    expect(readManifest().id).toBe('test-app')
  })

  test('forwards local application metadata for the workbench to read', async () => {
    await register()

    expect(readManifest()).toMatchObject({
      organizationId: 'org-123',
      slug: 'test-app',
      visibility: 'default',
    })
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
    const manifest = readManifest()
    expect(manifest.id).toBe('config:media-library')
    expect(manifest.configs).toEqual([expect.objectContaining({appType: 'media-library'})])
  })

  test('keeps the id when the server binds a port it did not ask for', async () => {
    await register({server: mockServer({boundPort: 3339, port: 3334}) as any})

    expect(readManifest()).toMatchObject({id: 'test-app', port: 3339})
  })

  test('logs an error and keeps the dev server up when another server already holds the id', async () => {
    // A live foreign server already advertises `test-app` in the registry.
    fsMock.files.set(
      join(REGISTRY_DIR, '4242.json'),
      JSON.stringify({
        host: 'localhost',
        id: 'test-app',
        pid: process.pid,
        port: 3334,
        startedAt: new Date().toISOString(),
        type: 'studio',
        version: 2,
        workDir: '/tmp/other',
      }),
    )
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
    // Nothing new registered, so the workbench never sees a second entry — and
    // nothing to watch or release.
    expect(fsMock.files.has(manifestPath())).toBe(false)
    expect(mockStartDevManifestWatcher).not.toHaveBeenCalled()
    await expect(handle.close()).resolves.toBeUndefined()
  })

  test('registers when a live dev server holds a different id', async () => {
    fsMock.files.set(
      join(REGISTRY_DIR, '4242.json'),
      JSON.stringify({
        host: 'localhost',
        id: 'other-app',
        pid: process.pid,
        port: 3334,
        startedAt: new Date().toISOString(),
        type: 'studio',
        version: 2,
        workDir: '/tmp/other',
      }),
    )
    const output = createMockOutput()

    await register({output})

    expect(output.error).not.toHaveBeenCalled()
    expect(readManifest().id).toBe('test-app')
  })

  test('forwards api.projectId to the registry', async () => {
    await register({cliConfig: {api: {projectId: 'x1g7jygt'}, app: workbenchApp()} as any})

    expect(readManifest().projectId).toBe('x1g7jygt')
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
    expect(readManifest().interfaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({name: 'feed', surface: 'panel'}),
        expect.objectContaining({name: 'inbox', surface: 'panel'}),
      ]),
    )
    expect(output.warn).not.toHaveBeenCalled()
    expect(output.error).not.toHaveBeenCalled()
  })

  test('omits projectId when api.projectId is not configured', async () => {
    await register()

    expect(readManifest().projectId).toBeUndefined()
  })

  test('registers without icon/title — they are derived from the inlined manifest', async () => {
    await register()

    const manifest = readManifest()
    expect(manifest).not.toHaveProperty('icon')
    expect(manifest).not.toHaveProperty('title')
  })

  test('registers app under the host applied by the vite dev server', async () => {
    await register({server: mockServer({host: 'mydev.local', port: 3334}) as any})

    expect(readManifest().host).toBe('mydev.local')
  })

  test('falls back to localhost when the vite server host is not a string', async () => {
    await register({server: mockServer({host: true, port: 3334}) as any})

    expect(readManifest().host).toBe('localhost')
  })

  test('registers app type when isApp is true', async () => {
    await register({isApp: true})

    expect(readManifest().type).toBe('coreApp')
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

  test('removes the registry entry on close', async () => {
    const result = await register()
    expect(fsMock.files.has(manifestPath())).toBe(true)

    await result.close()
    // The workbench no longer sees this server once it shuts down.
    expect(fsMock.files.has(manifestPath())).toBe(false)
  })

  test('propagates error when registering fails', async () => {
    const error = new Error('Registry write failed')
    fsMock.module.writeFileSync.mockImplementationOnce(() => {
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

    expect(readManifest().interfaces).toEqual(
      expect.arrayContaining([
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
    )
  })

  test('forwards no `window` interface when an SDK app declares no `entry`', async () => {
    await register({cliConfig: {app: workbenchApp()} as any, isApp: true})

    const {interfaces} = readManifest()
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

    await register({cliConfig: {app: workbenchApp()} as any, isApp: true, onInterfaceSetChange})
    const watcherUpdate = mockStartDevManifestWatcher.mock.calls[0][0].update

    // A panel appears → rebuild, then the persisted entry carries the new set.
    await watcherUpdate({interfaces: [feed], manifest: undefined, manifestUpdatedAt: 'a'})
    expect(onInterfaceSetChange).toHaveBeenCalledTimes(1)
    expect(readManifest().interfaces).toEqual([feed])
    expect(readManifest().manifestUpdatedAt).toBe('a')

    // Same set on the next pass → no rebuild, registry still re-broadcast.
    await watcherUpdate({interfaces: [feed], manifest: undefined, manifestUpdatedAt: 'b'})
    expect(onInterfaceSetChange).toHaveBeenCalledTimes(1)
    expect(readManifest().manifestUpdatedAt).toBe('b')
  })

  test('does not rebuild when only the manifest changes (same interface set)', async () => {
    const onInterfaceSetChange = vi.fn().mockResolvedValue(undefined)

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
    expect(readManifest().manifest).toEqual({title: 'Renamed', version: '1'})
  })

  test('retries the rebuild on the next pass when it fails — the registry stays unpatched in between', async () => {
    const onInterfaceSetChange = vi
      .fn()
      // e.g. the recreated server never came up (organizationId removed)
      .mockRejectedValueOnce(new Error('Dev server did not restart after the view/service change'))
      .mockResolvedValueOnce(mockServer({port: 3334}))

    await register({cliConfig: {app: workbenchApp()} as any, isApp: true, onInterfaceSetChange})
    const watcherUpdate = mockStartDevManifestWatcher.mock.calls[0][0].update

    // The failure must reach the watcher (it owns the warning), and the
    // registry must not advertise the new set on a server that never came back.
    await expect(
      watcherUpdate({interfaces: [feed], manifest: undefined, manifestUpdatedAt: 'a'}),
    ).rejects.toThrow('Dev server did not restart')
    expect(readManifest().manifestUpdatedAt).toBeUndefined()

    // Same declarations on the next save: the set id was not committed by the
    // failed pass, so the rebuild runs again instead of being skipped.
    await watcherUpdate({interfaces: [feed], manifest: undefined, manifestUpdatedAt: 'b'})
    expect(onInterfaceSetChange).toHaveBeenCalledTimes(2)
    expect(readManifest().manifestUpdatedAt).toBe('b')
  })

  test('patches the registry with the rebuilt server address after an interface-set change', async () => {
    // Non-strict ports: the recreated server can land on a different port than
    // the one captured at initial registration.
    const onInterfaceSetChange = vi
      .fn()
      .mockResolvedValue(mockServer({host: 'mydev.local', port: 4444}))

    await register({cliConfig: {app: workbenchApp()} as any, isApp: true, onInterfaceSetChange})
    const watcherUpdate = mockStartDevManifestWatcher.mock.calls[0][0].update

    await watcherUpdate({interfaces: [feed], manifest: undefined, manifestUpdatedAt: 'a'})
    expect(readManifest()).toMatchObject({host: 'mydev.local', interfaces: [feed], port: 4444})

    // A manifest-only pass (same set) must not rewrite the address.
    await watcherUpdate({interfaces: [feed], manifest: undefined, manifestUpdatedAt: 'b'})
    expect(readManifest()).toMatchObject({host: 'mydev.local', port: 4444})
  })

  test('still patches the registry when no rebuild handler is passed', async () => {
    await register({cliConfig: {app: workbenchApp()} as any, isApp: true})
    const watcherUpdate = mockStartDevManifestWatcher.mock.calls[0][0].update

    // The set changed but no handler was passed (e.g. studios) — no crash, and
    // the registry entry still reflects the new set.
    await watcherUpdate({interfaces: [feed], manifest: undefined, manifestUpdatedAt: 'a'})
    expect(readManifest().interfaces).toEqual([feed])
  })

  test('the registered server is discoverable through getRegisteredServers', async () => {
    await register()

    // End-to-end: what registration persisted is exactly what a workbench
    // reading the registry gets back.
    const [server] = getRegisteredServers()
    expect(server).toMatchObject({host: 'localhost', id: 'test-app', port: 3334, type: 'studio'})
  })
})
