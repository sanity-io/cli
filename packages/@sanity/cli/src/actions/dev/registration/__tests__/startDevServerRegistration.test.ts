import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMockOutput, workbenchApp, workbenchCliConfig} from '../../__tests__/testHelpers.js'
import {startDevServerRegistration} from '../startDevServerRegistration.js'

const mockRegisterDevServer = vi.hoisted(() => vi.fn())
const mockStartDevManifestWatcher = vi.hoisted(() => vi.fn())
const mockExtractCoreAppManifest = vi.hoisted(() => vi.fn())
const mockExtractStudioManifest = vi.hoisted(() => vi.fn())
const mockCheckForDeprecatedAppId = vi.hoisted(() => vi.fn())
const mockGetAppId = vi.hoisted(() => vi.fn())
const mockGetCliConfigUncached = vi.hoisted(() => vi.fn())

// The core-app watcher re-reads the config to re-derive interfaces on each edit.
vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getCliConfigUncached: mockGetCliConfigUncached,
}))
vi.mock('../../registry/registry.js', () => ({
  registerDevServer: mockRegisterDevServer,
}))
vi.mock('../startDevManifestWatcher.js', () => ({
  startDevManifestWatcher: mockStartDevManifestWatcher,
}))
vi.mock('../../../manifest/extractCoreAppManifest.js', () => ({
  extractCoreAppManifest: mockExtractCoreAppManifest,
}))
vi.mock('../extractDevServerManifest.js', () => ({
  extractStudioManifest: mockExtractStudioManifest,
}))
vi.mock('../../../../util/appId.js', () => ({
  checkForDeprecatedAppId: mockCheckForDeprecatedAppId,
  getAppId: mockGetAppId,
}))

function mockServer({host, port = 3334}: {host?: boolean | string; port?: number} = {}) {
  return {
    config: {server: {host, port}},
    httpServer: {address: () => ({address: '127.0.0.1', family: 'IPv4', port})},
  }
}

describe('startDevServerRegistration', () => {
  beforeEach(() => {
    mockRegisterDevServer.mockReturnValue({release: vi.fn(), update: vi.fn()})
    mockStartDevManifestWatcher.mockResolvedValue({close: vi.fn().mockResolvedValue(undefined)})
    mockExtractCoreAppManifest.mockResolvedValue(undefined)
    mockGetCliConfigUncached.mockResolvedValue({app: workbenchApp()})
    mockGetAppId.mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('registers studio in registry', async () => {
    await startDevServerRegistration({
      cliConfig: workbenchCliConfig(),
      isApp: false,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    expect(mockRegisterDevServer).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'localhost',
        port: 3334,
        type: 'studio',
      }),
    )
  })

  test('passes deployment.appId to registerDevServer', async () => {
    mockGetAppId.mockReturnValue('app-abc')

    await startDevServerRegistration({
      cliConfig: {app: workbenchApp(), deployment: {appId: 'app-abc'}},
      isApp: false,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({id: 'app-abc'}))
  })

  test('forwards api.projectId to registerDevServer', async () => {
    await startDevServerRegistration({
      cliConfig: {api: {projectId: 'x1g7jygt'}, app: workbenchApp()},
      isApp: false,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    expect(mockRegisterDevServer).toHaveBeenCalledWith(
      expect.objectContaining({projectId: 'x1g7jygt'}),
    )
  })

  test('omits projectId when api.projectId is not configured', async () => {
    await startDevServerRegistration({
      cliConfig: workbenchCliConfig(),
      isApp: false,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    const [registerArg] = mockRegisterDevServer.mock.calls[0]
    expect(registerArg.projectId).toBeUndefined()
  })

  test('checks for deprecated app.id', async () => {
    const output = createMockOutput()

    await startDevServerRegistration({
      cliConfig: {app: workbenchApp({id: 'legacy-app'})},
      isApp: false,
      output,
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    expect(mockCheckForDeprecatedAppId).toHaveBeenCalledWith(expect.objectContaining({output}))
  })

  test('registers without icon/title — they are derived from the inlined manifest', async () => {
    await startDevServerRegistration({
      cliConfig: workbenchCliConfig(),
      isApp: false,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    const [registerArg] = mockRegisterDevServer.mock.calls[0]
    expect(registerArg).not.toHaveProperty('icon')
    expect(registerArg).not.toHaveProperty('title')
  })

  test('registers app under the host applied by the vite dev server', async () => {
    await startDevServerRegistration({
      cliConfig: workbenchCliConfig(),
      isApp: false,
      output: createMockOutput(),
      server: mockServer({host: 'mydev.local', port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    expect(mockRegisterDevServer).toHaveBeenCalledWith(
      expect.objectContaining({host: 'mydev.local'}),
    )
  })

  test('falls back to localhost when the vite server host is not a string', async () => {
    await startDevServerRegistration({
      cliConfig: workbenchCliConfig(),
      isApp: false,
      output: createMockOutput(),
      server: mockServer({host: true, port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({host: 'localhost'}))
  })

  test('registers app type when isApp is true', async () => {
    await startDevServerRegistration({
      cliConfig: workbenchCliConfig(),
      isApp: true,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({type: 'coreApp'}))
  })

  test('starts the manifest watcher for studios', async () => {
    await startDevServerRegistration({
      cliConfig: workbenchCliConfig(),
      isApp: false,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

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
    await startDevServerRegistration({
      cliConfig: workbenchCliConfig(),
      isApp: true,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    expect(mockStartDevManifestWatcher).toHaveBeenCalledWith(
      expect.objectContaining({extract: expect.any(Function), workDir: '/tmp/sanity-project'}),
    )
    // App roots already resolve to sanity.cli.* — no extra filenames needed.
    expect(mockStartDevManifestWatcher.mock.calls[0][0].extraWatchFilenames).toBeUndefined()
  })

  test('wires extractCoreAppManifest into the core-app watcher and re-derives interfaces', async () => {
    const appManifest = {icon: '<svg><path d="M0 0"/></svg>', title: 'My App', version: '1'}
    mockExtractCoreAppManifest.mockResolvedValue(appManifest)
    // A fresh config read with a panel → the watcher re-derives + forwards it.
    mockGetCliConfigUncached.mockResolvedValue({
      app: workbenchApp({views: [{name: 'feed', src: './src/FeedPanel.tsx', type: 'panel'}]}),
    })

    await startDevServerRegistration({
      cliConfig: workbenchCliConfig(),
      isApp: true,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    const {extract} = mockStartDevManifestWatcher.mock.calls[0][0]
    // The manifest stays pure; interfaces ride alongside as a separate field.
    await expect(
      extract({configPath: '/tmp/sanity-project/sanity.cli.ts', workDir: '/tmp/sanity-project'}),
    ).resolves.toEqual({
      interfaces: [{entry_point: './src/FeedPanel.tsx', interface_type: 'panel', name: 'feed'}],
      manifest: appManifest,
    })
    expect(mockExtractCoreAppManifest).toHaveBeenCalledWith({workDir: '/tmp/sanity-project'})
  })

  test('wires extractStudioManifest into the studio watcher and re-derives interfaces', async () => {
    const studioManifest = {version: 3, workspaces: []}
    mockExtractStudioManifest.mockResolvedValue(studioManifest)
    // Studios declare panels/workers in `sanity.cli.ts` too — the watcher must
    // re-derive them. A hardcoded `interfaces: undefined` would wipe the
    // registered set on the first regeneration (the registry patch is a
    // shallow merge).
    mockGetCliConfigUncached.mockResolvedValue({
      app: workbenchApp({views: [{name: 'feed', src: './src/FeedPanel.tsx', type: 'panel'}]}),
    })

    await startDevServerRegistration({
      cliConfig: workbenchCliConfig(),
      isApp: false,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    const {extract} = mockStartDevManifestWatcher.mock.calls[0][0]
    await expect(
      extract({configPath: '/tmp/sanity-project/sanity.config.ts', workDir: '/tmp/sanity-project'}),
    ).resolves.toEqual({
      interfaces: [{entry_point: './src/FeedPanel.tsx', interface_type: 'panel', name: 'feed'}],
      manifest: studioManifest,
    })
    expect(mockExtractStudioManifest).toHaveBeenCalled()
  })

  test('calls manifest cleanup on close', async () => {
    const mockCleanup = vi.fn()
    mockRegisterDevServer.mockReturnValue({release: mockCleanup, update: vi.fn()})

    const result = await startDevServerRegistration({
      cliConfig: workbenchCliConfig(),
      isApp: false,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    await result.close()
    expect(mockCleanup).toHaveBeenCalled()
  })

  test('propagates error when registerDevServer throws', async () => {
    const error = new Error('Registry write failed')
    mockRegisterDevServer.mockImplementation(() => {
      throw error
    })

    await expect(
      startDevServerRegistration({
        cliConfig: workbenchCliConfig(),
        isApp: false,
        output: createMockOutput(),
        server: mockServer({port: 3334}) as any,
        workDir: '/tmp/sanity-project',
      }),
    ).rejects.toThrow(error)
  })

  test('propagates error when startDevManifestWatcher rejects', async () => {
    const error = new Error('Watcher setup failed')
    mockStartDevManifestWatcher.mockRejectedValue(error)

    await expect(
      startDevServerRegistration({
        cliConfig: workbenchCliConfig(),
        isApp: false,
        output: createMockOutput(),
        server: mockServer({port: 3334}) as any,
        workDir: '/tmp/sanity-project',
      }),
    ).rejects.toThrow(error)
  })

  test('calls output.error when both app.id and deployment.appId are set', async () => {
    mockCheckForDeprecatedAppId.mockImplementation(({output}: {output: any}) => {
      output.error('Found both app.id (deprecated) and deployment.appId', {exit: 1})
    })

    const output = createMockOutput()

    await startDevServerRegistration({
      cliConfig: {
        app: workbenchApp({id: 'legacy-app'}),
        deployment: {appId: 'new-app'},
      },
      isApp: false,
      output,
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    expect(output.error).toHaveBeenCalledWith(
      expect.stringContaining('Found both app.id (deprecated) and deployment.appId'),
      expect.objectContaining({exit: 1}),
    )
  })

  // US5 — `entry` declares an SDK app's navigable `app` view.
  test('forwards an `app` interface derived from `entry` for an SDK app', async () => {
    await startDevServerRegistration({
      cliConfig: {app: workbenchApp({entry: './src/App.tsx'})},
      isApp: true,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    expect(mockRegisterDevServer).toHaveBeenCalledWith(
      expect.objectContaining({
        interfaces: expect.arrayContaining([
          {entry_point: './src/App.tsx', interface_type: 'app', name: 'test-app'},
        ]),
      }),
    )
  })

  test('forwards no `app` interface when an SDK app declares no `entry`', async () => {
    await startDevServerRegistration({
      cliConfig: {app: workbenchApp()},
      isApp: true,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    const {interfaces} = mockRegisterDevServer.mock.calls[0][0]
    expect(
      (interfaces ?? []).some((i: {interface_type: string}) => i.interface_type === 'app'),
    ).toBe(false)
  })

  test('rejects a studio that declares `entry` — app views for studios are not implemented yet', async () => {
    await expect(
      startDevServerRegistration({
        cliConfig: {app: workbenchApp({entry: './src/App.tsx'})},
        isApp: false,
        output: createMockOutput(),
        server: mockServer({port: 3334}) as any,
        workDir: '/tmp/sanity-project',
      }),
    ).rejects.toThrow('App views for studios are not implemented yet')
  })

  // FR-024 — adding/removing a view or service must rebuild the federation
  // remote so the new interface gets an expose + artifact. The watcher drives it.
  const feed = {entry_point: './src/Feed.tsx', interface_type: 'panel', name: 'feed'}

  test('rebuilds the remote when the interface set changes, then keeps quiet on a repeat', async () => {
    const onInterfaceSetChange = vi.fn().mockResolvedValue(undefined)
    const update = vi.fn()
    mockRegisterDevServer.mockReturnValue({release: vi.fn(), update})

    await startDevServerRegistration({
      cliConfig: {app: workbenchApp()}, // no interfaces yet
      isApp: true,
      onInterfaceSetChange,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })
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

    await startDevServerRegistration({
      cliConfig: {
        app: workbenchApp({views: [{name: 'feed', src: './src/Feed.tsx', type: 'panel'}]}),
      },
      isApp: true,
      onInterfaceSetChange,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
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

  test('still patches the registry when no rebuild handler is passed', async () => {
    const update = vi.fn()
    mockRegisterDevServer.mockReturnValue({release: vi.fn(), update})

    await startDevServerRegistration({
      cliConfig: {app: workbenchApp()}, // no interfaces yet
      isApp: true,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })
    const watcherUpdate = mockStartDevManifestWatcher.mock.calls[0][0].update

    // The set changed but no handler was passed (e.g. studios) — no crash, and
    // the registry patch still goes through.
    await watcherUpdate({interfaces: [feed], manifest: undefined, manifestUpdatedAt: 'a'})
    expect(update).toHaveBeenCalledTimes(1)
  })
})
