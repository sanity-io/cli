import {type CliConfig, type Output} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {startWorkbenchDevServer} from '../startWorkbenchDevServer.js'

const mockModuleResolve = vi.hoisted(() => vi.fn())
const mockCreateServer = vi.hoisted(() => vi.fn())
const mockGetSharedServerConfig = vi.hoisted(() => vi.fn())
const mockWriteWorkbenchRuntime = vi.hoisted(() => vi.fn())

vi.mock('import-meta-resolve', () => ({moduleResolve: mockModuleResolve}))
vi.mock('vite', () => ({createServer: mockCreateServer}))
vi.mock('@vitejs/plugin-react', () => ({default: vi.fn(() => [])}))
vi.mock('../../../util/getSharedServerConfig.js', () => ({
  getSharedServerConfig: mockGetSharedServerConfig,
}))
vi.mock('../writeWorkbenchRuntime.js', () => ({
  writeWorkbenchRuntime: mockWriteWorkbenchRuntime,
}))

function createMockOutput(): Output {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
}

function createMockServer() {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    config: {server: {port: 3333}},
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
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  describe('federation gate', () => {
    test('skips workbench entirely when federation is not enabled', async () => {
      const result = await startWorkbenchDevServer(createOptions())

      expect(result.workbenchAvailable).toBe(false)
      expect(result.close).toBeUndefined()
      expect(mockModuleResolve).not.toHaveBeenCalled()
      expect(mockCreateServer).not.toHaveBeenCalled()
    })

    test('skips workbench when federation is explicitly disabled', async () => {
      const result = await startWorkbenchDevServer(
        createOptions({cliConfig: {federation: {enabled: false}}}),
      )

      expect(result.workbenchAvailable).toBe(false)
      expect(result.close).toBeUndefined()
      expect(mockModuleResolve).not.toHaveBeenCalled()
    })

    test('returns httpHost and workbenchPort even when federation is disabled', async () => {
      mockGetSharedServerConfig.mockReturnValue({httpHost: '0.0.0.0', httpPort: 4000})

      const result = await startWorkbenchDevServer(createOptions())

      expect(result.httpHost).toBe('0.0.0.0')
      expect(result.workbenchPort).toBe(4000)
    })
  })

  describe('workbench availability check', () => {
    test('returns workbenchAvailable: false when sanity/workbench is not resolvable', async () => {
      mockModuleResolve.mockImplementation(() => {
        throw new Error('ERR_PACKAGE_PATH_NOT_EXPORTED')
      })

      const result = await startWorkbenchDevServer(
        createOptions({cliConfig: {federation: {enabled: true}}}),
      )

      expect(result.workbenchAvailable).toBe(false)
      expect(result.close).toBeUndefined()
      expect(mockCreateServer).not.toHaveBeenCalled()
    })

    test('returns httpHost and workbenchPort even when workbench is unavailable', async () => {
      mockGetSharedServerConfig.mockReturnValue({httpHost: '0.0.0.0', httpPort: 4000})
      mockModuleResolve.mockImplementation(() => {
        throw new Error('ERR_PACKAGE_PATH_NOT_EXPORTED')
      })

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
      mockModuleResolve.mockReturnValue(new URL('file:///tmp/node_modules/sanity/workbench.js'))
      mockCreateServer.mockResolvedValue(createMockServer())

      const result = await startWorkbenchDevServer(createOptions({cliConfig: federationConfig}))

      if (!result.close) throw new Error('Expected close to be defined')
      expect(result.workbenchAvailable).toBe(true)
      expect(result.close).toBeDefined()
    })

    test('returns httpHost and workbenchPort from getSharedServerConfig', async () => {
      mockGetSharedServerConfig.mockReturnValue({httpHost: '0.0.0.0', httpPort: 4000})
      mockModuleResolve.mockReturnValue(new URL('file:///tmp/node_modules/sanity/workbench.js'))
      mockCreateServer.mockResolvedValue(createMockServer())

      const result = await startWorkbenchDevServer(createOptions({cliConfig: federationConfig}))

      expect(result.httpHost).toBe('0.0.0.0')
      expect(result.workbenchPort).toBe(4000)
    })

    test('passes workDir to writeWorkbenchRuntime', async () => {
      mockModuleResolve.mockReturnValue(new URL('file:///tmp/node_modules/sanity/workbench.js'))
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(createOptions({cliConfig: federationConfig}))

      expect(mockWriteWorkbenchRuntime).toHaveBeenCalledWith(
        expect.objectContaining({cwd: '/tmp/sanity-project'}),
      )
    })
  })

  describe('reactStrictMode', () => {
    test('uses SANITY_STUDIO_REACT_STRICT_MODE=true env var over cliConfig', async () => {
      vi.stubEnv('SANITY_STUDIO_REACT_STRICT_MODE', 'true')
      mockModuleResolve.mockReturnValue(new URL('file:///tmp/node_modules/sanity/workbench.js'))
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
      mockModuleResolve.mockReturnValue(new URL('file:///tmp/node_modules/sanity/workbench.js'))
      mockCreateServer.mockResolvedValue(createMockServer())

      await startWorkbenchDevServer(
        createOptions({cliConfig: {federation: {enabled: true}, reactStrictMode: true}}),
      )

      expect(mockWriteWorkbenchRuntime).toHaveBeenCalledWith(
        expect.objectContaining({reactStrictMode: false}),
      )
    })

    test('falls back to cliConfig.reactStrictMode when env var is not set', async () => {
      mockModuleResolve.mockReturnValue(new URL('file:///tmp/node_modules/sanity/workbench.js'))
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
      mockModuleResolve.mockReturnValue(new URL('file:///tmp/node_modules/sanity/workbench.js'))
      const mockServer = createMockServer()
      mockServer.listen.mockRejectedValue(new Error('Port already in use'))
      mockCreateServer.mockResolvedValue(mockServer)
      const output = createMockOutput()

      const result = await startWorkbenchDevServer(
        createOptions({cliConfig: federationConfig, output}),
      )

      expect(result.workbenchAvailable).toBe(false)
      expect(result.close).toBeUndefined()
      expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('Port already in use'))
    })

    test('closes the server before returning when listen() throws', async () => {
      mockModuleResolve.mockReturnValue(new URL('file:///tmp/node_modules/sanity/workbench.js'))
      const mockServer = createMockServer()
      mockServer.listen.mockRejectedValue(new Error('Port already in use'))
      mockCreateServer.mockResolvedValue(mockServer)

      await startWorkbenchDevServer(createOptions({cliConfig: federationConfig}))

      expect(mockServer.close).toHaveBeenCalled()
    })
  })
})
