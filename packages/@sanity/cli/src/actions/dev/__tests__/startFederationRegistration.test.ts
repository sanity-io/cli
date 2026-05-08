import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {startFederationRegistration} from '../startFederationRegistration.js'
import {createMockOutput} from './testHelpers.js'

const mockRegisterDevServer = vi.hoisted(() => vi.fn())
const mockStartDevManifestWatcher = vi.hoisted(() => vi.fn())
const mockExtractCoreAppManifest = vi.hoisted(() => vi.fn())
const mockExtractStudioManifest = vi.hoisted(() => vi.fn())
const mockCheckForDeprecatedAppId = vi.hoisted(() => vi.fn())
const mockGetAppId = vi.hoisted(() => vi.fn())

vi.mock('../devServerRegistry.js', () => ({
  registerDevServer: mockRegisterDevServer,
}))
vi.mock('../startDevManifestWatcher.js', () => ({
  startDevManifestWatcher: mockStartDevManifestWatcher,
}))
vi.mock('../../manifest/extractCoreAppManifest.js', () => ({
  extractCoreAppManifest: mockExtractCoreAppManifest,
}))
vi.mock('../extractDevServerManifest.js', () => ({
  extractStudioManifest: mockExtractStudioManifest,
}))
vi.mock('../../../util/appId.js', () => ({
  checkForDeprecatedAppId: mockCheckForDeprecatedAppId,
  getAppId: mockGetAppId,
}))

function mockServer({host, port = 3334}: {host?: boolean | string; port?: number} = {}) {
  return {
    config: {server: {host, port}},
    httpServer: {address: () => ({address: '127.0.0.1', family: 'IPv4', port})},
  }
}

describe('startFederationRegistration', () => {
  beforeEach(() => {
    mockRegisterDevServer.mockReturnValue({release: vi.fn(), update: vi.fn()})
    mockStartDevManifestWatcher.mockResolvedValue({close: vi.fn().mockResolvedValue(undefined)})
    mockExtractCoreAppManifest.mockResolvedValue(undefined)
    mockGetAppId.mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('registers studio in registry', async () => {
    await startFederationRegistration({
      cliConfig: {federation: {enabled: true}},
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

    await startFederationRegistration({
      cliConfig: {deployment: {appId: 'app-abc'}, federation: {enabled: true}},
      isApp: false,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({id: 'app-abc'}))
  })

  test('forwards api.projectId to registerDevServer', async () => {
    await startFederationRegistration({
      cliConfig: {api: {projectId: 'x1g7jygt'}, federation: {enabled: true}},
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
    await startFederationRegistration({
      cliConfig: {federation: {enabled: true}},
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

    await startFederationRegistration({
      cliConfig: {app: {id: 'legacy-app'}, federation: {enabled: true}},
      isApp: false,
      output,
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    expect(mockCheckForDeprecatedAppId).toHaveBeenCalledWith(expect.objectContaining({output}))
  })

  test('registers without icon/title — they are derived from the inlined manifest', async () => {
    await startFederationRegistration({
      cliConfig: {federation: {enabled: true}},
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
    await startFederationRegistration({
      cliConfig: {federation: {enabled: true}},
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
    await startFederationRegistration({
      cliConfig: {federation: {enabled: true}},
      isApp: false,
      output: createMockOutput(),
      server: mockServer({host: true, port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({host: 'localhost'}))
  })

  test('registers app type when isApp is true', async () => {
    await startFederationRegistration({
      cliConfig: {federation: {enabled: true}},
      isApp: true,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({type: 'coreApp'}))
  })

  test('starts the manifest watcher for studios', async () => {
    await startFederationRegistration({
      cliConfig: {federation: {enabled: true}},
      isApp: false,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    expect(mockStartDevManifestWatcher).toHaveBeenCalledWith(
      expect.objectContaining({workDir: '/tmp/sanity-project'}),
    )
  })

  test('starts the manifest watcher for core apps', async () => {
    await startFederationRegistration({
      cliConfig: {federation: {enabled: true}},
      isApp: true,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    expect(mockStartDevManifestWatcher).toHaveBeenCalledWith(
      expect.objectContaining({extract: expect.any(Function), workDir: '/tmp/sanity-project'}),
    )
  })

  test('wires extractCoreAppManifest into the core-app watcher', async () => {
    const appManifest = {icon: '<svg><path d="M0 0"/></svg>', title: 'My App', version: '1'}
    mockExtractCoreAppManifest.mockResolvedValue(appManifest)

    await startFederationRegistration({
      cliConfig: {federation: {enabled: true}},
      isApp: true,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    const {extract} = mockStartDevManifestWatcher.mock.calls[0][0]
    await expect(
      extract({configPath: '/tmp/sanity-project/sanity.cli.ts', workDir: '/tmp/sanity-project'}),
    ).resolves.toEqual(appManifest)
    expect(mockExtractCoreAppManifest).toHaveBeenCalledWith({workDir: '/tmp/sanity-project'})
  })

  test('wires extractStudioManifest into the studio watcher', async () => {
    await startFederationRegistration({
      cliConfig: {federation: {enabled: true}},
      isApp: false,
      output: createMockOutput(),
      server: mockServer({port: 3334}) as any,
      workDir: '/tmp/sanity-project',
    })

    const {extract} = mockStartDevManifestWatcher.mock.calls[0][0]
    expect(extract).toBe(mockExtractStudioManifest)
  })

  test('calls manifest cleanup on close', async () => {
    const mockCleanup = vi.fn()
    mockRegisterDevServer.mockReturnValue({release: mockCleanup, update: vi.fn()})

    const result = await startFederationRegistration({
      cliConfig: {federation: {enabled: true}},
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
      startFederationRegistration({
        cliConfig: {federation: {enabled: true}},
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
      startFederationRegistration({
        cliConfig: {federation: {enabled: true}},
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

    await startFederationRegistration({
      cliConfig: {
        app: {id: 'legacy-app'},
        deployment: {appId: 'new-app'},
        federation: {enabled: true},
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
})
