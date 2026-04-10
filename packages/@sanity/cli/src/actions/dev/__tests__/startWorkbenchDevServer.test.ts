import {type CliConfig, type Output} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {startWorkbenchDevServer} from '../startWorkbenchDevServer.js'

const mockResolveLocalPackage = vi.hoisted(() => vi.fn())
const mockCreateServer = vi.hoisted(() => vi.fn())
const mockGetSharedServerConfig = vi.hoisted(() => vi.fn())
const mockWriteWorkbenchRuntime = vi.hoisted(() => vi.fn())
const mockAcquireWorkbenchLock = vi.hoisted(() => vi.fn())
const mockFindLiveWorkbench = vi.hoisted(() => vi.fn())
const mockRegisterDevServer = vi.hoisted(() => vi.fn())
const mockWatchRegistry = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    resolveLocalPackage: mockResolveLocalPackage,
  }
})
vi.mock('vite', () => ({createServer: mockCreateServer}))
vi.mock('@vitejs/plugin-react', () => ({default: vi.fn(() => [])}))
vi.mock('../../../util/getSharedServerConfig.js', () => ({
  getSharedServerConfig: mockGetSharedServerConfig,
}))
vi.mock('../writeWorkbenchRuntime.js', () => ({
  writeWorkbenchRuntime: mockWriteWorkbenchRuntime,
}))
vi.mock('../../../util/devServerRegistry.js', () => ({
  acquireWorkbenchLock: mockAcquireWorkbenchLock,
  findLiveWorkbench: mockFindLiveWorkbench,
  registerDevServer: mockRegisterDevServer,
  watchRegistry: mockWatchRegistry,
}))

function createMockOutput(): Output {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
}

function createMockServer(port = 3333) {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    config: {server: {port}},
    hot: {send: vi.fn()},
    httpServer: {address: vi.fn().mockReturnValue({address: '127.0.0.1', family: 'IPv4', port})},
    listen: vi.fn().mockResolvedValue(undefined),
  }
}

/** These are not relevant for what we are testing, but still needed to pass type checker */
const FLAGS = {
  'auto-updates': false,
  host: 'localhost',
  json: false,
  port: '3333',
} as const

function createOptions(overrides?: {cliConfig?: CliConfig; output?: Output}) {
  return {
    cliConfig: overrides?.cliConfig ?? ({} as CliConfig),
    flags: FLAGS,
    isApp: false,
    output: overrides?.output ?? createMockOutput(),
    workDir: '/tmp/sanity-project',
  }
}

describe('startWorkbenchDevServer', () => {
  beforeEach(() => {
    mockGetSharedServerConfig.mockReturnValue({httpHost: 'localhost', httpPort: 3333})
    mockWriteWorkbenchRuntime.mockResolvedValue('/tmp/sanity-project/.sanity/workbench')
    mockAcquireWorkbenchLock.mockReturnValue(vi.fn())
    mockFindLiveWorkbench.mockReturnValue(undefined)
    mockRegisterDevServer.mockReturnValue(vi.fn())
    mockWatchRegistry.mockReturnValue({close: vi.fn()})
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  describe('federation gate', () => {
    test('skips workbench entirely when federation is not enabled', async () => {
      const result = await startWorkbenchDevServer(createOptions())

      expect(result.workbenchAvailable).toBe(false)
      expect(result.close).toBeTypeOf('function')
      expect(mockResolveLocalPackage).not.toHaveBeenCalled()
      expect(mockCreateServer).not.toHaveBeenCalled()
    })

    test('skips workbench when federation is explicitly disabled', async () => {
      const result = await startWorkbenchDevServer(
        createOptions({cliConfig: {federation: {enabled: false}}}),
      )

      expect(result.workbenchAvailable).toBe(false)
      expect(result.close).toBeTypeOf('function')
      expect(mockResolveLocalPackage).not.toHaveBeenCalled()
    })

    test('returns httpHost and workbenchPort even when federation is disabled', async () => {
      mockGetSharedServerConfig.mockReturnValue({httpHost: '0.0.0.0', httpPort: 4000})

      const result = await startWorkbenchDevServer(createOptions())

      expect(result.httpHost).toBe('0.0.0.0')
      expect(result.workbenchPort).toBe(4000)
    })
  })

  describe('workbench availability check', () => {
    test('returns workbenchAvailable: false when @sanity/workbench is not resolvable', async () => {
      mockResolveLocalPackage.mockRejectedValue(new Error('Cannot find package'))

      const result = await startWorkbenchDevServer(
        createOptions({cliConfig: {federation: {enabled: true}}}),
      )

      expect(result.workbenchAvailable).toBe(false)
      expect(result.close).toBeTypeOf('function')
      expect(mockCreateServer).not.toHaveBeenCalled()
    })

    test('returns httpHost and workbenchPort even when workbench is unavailable', async () => {
      mockGetSharedServerConfig.mockReturnValue({httpHost: '0.0.0.0', httpPort: 4000})
      mockResolveLocalPackage.mockRejectedValue(new Error('Cannot find package'))

      const result = await startWorkbenchDevServer(
        createOptions({cliConfig: {federation: {enabled: true}}}),
      )

      expect(result.httpHost).toBe('0.0.0.0')
      expect(result.workbenchPort).toBe(4000)
    })
  })

  describe('successful startup', () => {
    const federationConfig = {federation: {enabled: true}} as const

    test('returns workbenchAvailable: true and close when server starts', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      const result = await startWorkbenchDevServer(createOptions({cliConfig: federationConfig}))

      if (!result.close) throw new Error('Expected close to be defined')
      expect(result.workbenchAvailable).toBe(true)
      expect(result.close).toBeDefined()
    })

    test('returns httpHost and workbenchPort from getSharedServerConfig', async () => {
      mockGetSharedServerConfig.mockReturnValue({httpHost: '0.0.0.0', httpPort: 4000})
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer(4000))

      const result = await startWorkbenchDevServer(createOptions({cliConfig: federationConfig}))

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

      const result = await startWorkbenchDevServer(createOptions())

      expect(result.workbenchPort).toBe(3333)
    })

    test('passes workDir to writeWorkbenchRuntime', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(createOptions({cliConfig: federationConfig}))

      expect(mockWriteWorkbenchRuntime).toHaveBeenCalledWith(
        expect.objectContaining({cwd: '/tmp/sanity-project'}),
      )
    })

    test('passes organizationId from cliConfig.app.organizationId', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(
        createOptions({
          cliConfig: {app: {organizationId: 'org-123'}, federation: {enabled: true}},
        }),
      )

      expect(mockWriteWorkbenchRuntime).toHaveBeenCalledWith(
        expect.objectContaining({organizationId: 'org-123'}),
      )
    })

    test('passes organizationId: undefined when not set in cliConfig', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(createOptions({cliConfig: {federation: {enabled: true}}}))

      expect(mockWriteWorkbenchRuntime).toHaveBeenCalledWith(
        expect.objectContaining({organizationId: undefined}),
      )
    })

    test('configures warmup for the workbench entry file', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(createOptions({cliConfig: federationConfig}))

      expect(mockCreateServer).toHaveBeenCalledWith(
        expect.objectContaining({
          server: expect.objectContaining({
            warmup: {clientFiles: ['./workbench.js']},
          }),
        }),
      )
    })
  })

  describe('reactStrictMode', () => {
    test('uses SANITY_STUDIO_REACT_STRICT_MODE=true env var over cliConfig', async () => {
      vi.stubEnv('SANITY_STUDIO_REACT_STRICT_MODE', 'true')
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(
        createOptions({cliConfig: {federation: {enabled: true}, reactStrictMode: false}}),
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
        createOptions({cliConfig: {federation: {enabled: true}, reactStrictMode: true}}),
      )

      expect(mockWriteWorkbenchRuntime).toHaveBeenCalledWith(
        expect.objectContaining({reactStrictMode: false}),
      )
    })

    test('falls back to cliConfig.reactStrictMode when env var is not set', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(
        createOptions({cliConfig: {federation: {enabled: true}, reactStrictMode: true}}),
      )

      expect(mockWriteWorkbenchRuntime).toHaveBeenCalledWith(
        expect.objectContaining({reactStrictMode: true}),
      )
    })
  })

  describe('server startup failure', () => {
    const federationConfig = {federation: {enabled: true}} as const

    test('warns and returns without close when listen() throws', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      const mockServer = createMockServer()
      mockServer.listen.mockRejectedValue(new Error('Port already in use'))
      mockCreateServer.mockResolvedValue(mockServer)
      const output = createMockOutput()

      const result = await startWorkbenchDevServer(
        createOptions({cliConfig: federationConfig, output}),
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

      await startWorkbenchDevServer(createOptions({cliConfig: federationConfig}))

      expect(mockServer.close).toHaveBeenCalled()
    })
  })

  describe('singleton detection', () => {
    const federationConfig = {federation: {enabled: true}} as const

    test('skips starting server when lock is held by another process', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockAcquireWorkbenchLock.mockReturnValue(undefined)
      mockFindLiveWorkbench.mockReturnValue({
        host: '0.0.0.0',
        pid: 12_345,
        port: 4000,
        startedAt: new Date().toISOString(),
        type: 'workbench',
        workDir: '/tmp/other-project',
      })

      const result = await startWorkbenchDevServer(createOptions({cliConfig: federationConfig}))

      expect(result.workbenchAvailable).toBe(true)
      expect(result.workbenchPort).toBe(4000)
      expect(result.httpHost).toBe('0.0.0.0')
      expect(result.close).toBeTypeOf('function')
      expect(mockCreateServer).not.toHaveBeenCalled()
    })

    test('falls back to configured host/port when lock is held but no workbench manifest found', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockAcquireWorkbenchLock.mockReturnValue(undefined)
      mockFindLiveWorkbench.mockReturnValue(undefined)

      const result = await startWorkbenchDevServer(createOptions({cliConfig: federationConfig}))

      expect(result.workbenchAvailable).toBe(true)
      expect(result.workbenchPort).toBe(3333)
      expect(result.httpHost).toBe('localhost')
      expect(mockCreateServer).not.toHaveBeenCalled()
    })
  })

  describe('registry integration', () => {
    const federationConfig = {federation: {enabled: true}} as const

    test('registers workbench in registry after successful startup', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(createOptions({cliConfig: federationConfig}))

      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 3333,
          type: 'workbench',
        }),
      )
    })

    test('starts watching registry after successful startup', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(createOptions({cliConfig: federationConfig}))

      expect(mockWatchRegistry).toHaveBeenCalledWith(expect.any(Function))
    })

    test('watcher callback broadcasts non-workbench servers via server.hot.send', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      const mockServer = createMockServer()
      mockCreateServer.mockResolvedValue(mockServer)

      await startWorkbenchDevServer(createOptions({cliConfig: federationConfig}))

      // Get the callback passed to watchRegistry and invoke it
      const watchCallback = mockWatchRegistry.mock.calls[0][0]
      const fakeServers = [
        {pid: 1, port: 3333, type: 'workbench'},
        {pid: 2, port: 3334, type: 'studio'},
        {pid: 3, port: 3335, type: 'app'},
      ]
      watchCallback(fakeServers)

      expect(mockServer.hot.send).toHaveBeenCalledWith('sanity:workbench:local-applications', {
        servers: [
          {pid: 2, port: 3334, type: 'studio'},
          {pid: 3, port: 3335, type: 'app'},
        ],
      })
    })

    test('close stops watcher, cleans up manifest, and releases lock', async () => {
      const mockCleanup = vi.fn()
      const mockWatcherClose = vi.fn()
      const mockReleaseLock = vi.fn()
      mockAcquireWorkbenchLock.mockReturnValue(mockReleaseLock)
      mockRegisterDevServer.mockReturnValue(mockCleanup)
      mockWatchRegistry.mockReturnValue({close: mockWatcherClose})
      mockResolveLocalPackage.mockResolvedValue({})
      mockCreateServer.mockResolvedValue(createMockServer())

      const result = await startWorkbenchDevServer(createOptions({cliConfig: federationConfig}))

      if (!result.close) throw new Error('Expected close to be defined')
      await result.close()

      expect(mockWatcherClose).toHaveBeenCalled()
      expect(mockCleanup).toHaveBeenCalled()
      expect(mockReleaseLock).toHaveBeenCalled()
    })

    test('does not register when server startup fails', async () => {
      mockResolveLocalPackage.mockResolvedValue({})
      const mockServer = createMockServer()
      mockServer.listen.mockRejectedValue(new Error('Port already in use'))
      mockCreateServer.mockResolvedValue(mockServer)

      await startWorkbenchDevServer(createOptions({cliConfig: federationConfig}))

      expect(mockRegisterDevServer).not.toHaveBeenCalled()
    })
  })
})
