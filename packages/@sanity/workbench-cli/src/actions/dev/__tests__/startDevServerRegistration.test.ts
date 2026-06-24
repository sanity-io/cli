import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {startDevServerRegistration} from '../startDevServerRegistration.js'
import {createMockOutput, workbenchApp, workbenchCliConfig} from './devTestHelpers.js'

const mockRegisterDevServer = vi.hoisted(() => vi.fn())
const mockStartDevManifestWatcher = vi.hoisted(() => vi.fn())
const mockExtractManifest = vi.hoisted(() => vi.fn())
const mockGetCliConfigUncached = vi.hoisted(() => vi.fn())

// The watcher re-reads the config to re-derive interfaces on each edit.
vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getCliConfigUncached: mockGetCliConfigUncached,
}))
// Only the registry write is mocked; `deriveInterfaces`/`trackInterfaceSet` are
// pure and run for real.
vi.mock('../registry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../registry.js')>()),
  registerDevServer: mockRegisterDevServer,
}))
vi.mock('../startDevManifestWatcher.js', () => ({
  startDevManifestWatcher: mockStartDevManifestWatcher,
}))

function mockServer({host, port = 3334}: {host?: boolean | string; port?: number} = {}) {
  return {
    config: {server: {host, port}},
    httpServer: {address: () => ({address: '127.0.0.1', family: 'IPv4', port})},
  }
}

type RegistrationOptions = Parameters<typeof startDevServerRegistration>[0]

/** Run registration with sensible defaults; override only what a test asserts on. */
function register(overrides: Partial<RegistrationOptions> = {}) {
  return startDevServerRegistration({
    appId: undefined,
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

  test('records the caller-resolved appId on the registry entry', async () => {
    await register({appId: 'app-abc'})

    expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({id: 'app-abc'}))
  })

  test('forwards api.projectId to registerDevServer', async () => {
    await register({cliConfig: {api: {projectId: 'x1g7jygt'}, app: workbenchApp()} as any})

    expect(mockRegisterDevServer).toHaveBeenCalledWith(
      expect.objectContaining({projectId: 'x1g7jygt'}),
    )
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
        // services live in sanity.cli.* — the watcher must react to both.
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
      app: workbenchApp({views: [{name: 'feed', src: './src/FeedPanel.tsx', type: 'panel'}]}),
    })

    await register({isApp: true})

    const {extract} = mockStartDevManifestWatcher.mock.calls[0][0]
    const params = {configPath: '/tmp/sanity-project/sanity.cli.ts', workDir: '/tmp/sanity-project'}
    await expect(extract(params)).resolves.toEqual({
      interfaces: [{entry_point: './src/FeedPanel.tsx', interface_type: 'panel', name: 'feed'}],
      manifest,
    })
    expect(mockExtractManifest).toHaveBeenCalledWith(params)
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

  // US5 — `entry` declares an SDK app's navigable `app` view.
  test('forwards an `app` interface derived from `entry` for an SDK app', async () => {
    await register({cliConfig: {app: workbenchApp({entry: './src/App.tsx'})} as any, isApp: true})

    expect(mockRegisterDevServer).toHaveBeenCalledWith(
      expect.objectContaining({
        interfaces: expect.arrayContaining([
          {entry_point: './src/App.tsx', interface_type: 'app', name: 'test-app'},
        ]),
      }),
    )
  })

  test('forwards no `app` interface when an SDK app declares no `entry`', async () => {
    await register({cliConfig: {app: workbenchApp()} as any, isApp: true})

    const {interfaces} = mockRegisterDevServer.mock.calls[0][0]
    expect(
      (interfaces ?? []).some((i: {interface_type: string}) => i.interface_type === 'app'),
    ).toBe(false)
  })

  test('rejects a studio that declares `entry` — app views for studios are not implemented yet', async () => {
    await expect(
      register({cliConfig: {app: workbenchApp({entry: './src/App.tsx'})} as any, isApp: false}),
    ).rejects.toThrow('App views for studios are not implemented yet')
  })

  // FR-024 — adding/removing a view or service must rebuild the federation
  // remote so the new interface gets an expose + artifact. The watcher drives it.
  const feed = {entry_point: './src/Feed.tsx', interface_type: 'panel', name: 'feed'}

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
        app: workbenchApp({views: [{name: 'feed', src: './src/Feed.tsx', type: 'panel'}]}),
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
