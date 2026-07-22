import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {buildAppId} from '../../../appId.js'
import {resolveWorkbenchApp} from '../../../resolveWorkbenchApp.js'
import {
  createMockOutput,
  mockWorkbenchServer,
  workbenchCliConfig,
} from '../../dev/__tests__/devTestHelpers.js'
import {startWorkbenchPreview, type StartWorkbenchPreviewOptions} from '../startWorkbenchPreview.js'

const mockStartWorkbenchDevServer = vi.hoisted(() => vi.fn())
const mockServeBuiltApplication = vi.hoisted(() => vi.fn())
const mockRegisterDevServer = vi.hoisted(() => vi.fn())
const mockFindProjectRoot = vi.hoisted(() => vi.fn())
const mockReadFile = vi.hoisted(() => vi.fn())

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  readFile: mockReadFile,
}))
vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  findProjectRoot: mockFindProjectRoot,
}))
vi.mock('../../dev/startWorkbenchDevServer.js', () => ({
  startWorkbenchDevServer: mockStartWorkbenchDevServer,
}))
vi.mock('../serveBuiltApplication.js', () => ({serveBuiltApplication: mockServeBuiltApplication}))
vi.mock('../../dev/registry.js', () => ({registerDevServer: mockRegisterDevServer}))

const mockExtractManifest = vi.hoisted(() => vi.fn())
const mockCheckForDeprecatedAppId = vi.hoisted(() => vi.fn())

function run(overrides: Partial<StartWorkbenchPreviewOptions> = {}) {
  return startWorkbenchPreview({
    cacheDir: '/tmp/sanity-project/.sanity/vite',
    checkForDeprecatedAppId: mockCheckForDeprecatedAppId,
    cliConfig: workbenchCliConfig(),
    extractManifest: mockExtractManifest,
    httpHost: 'localhost',
    httpPort: 3333,
    isApp: true,
    outDir: '/tmp/sanity-project/dist',
    output: createMockOutput(),
    reactStrictMode: false,
    workDir: '/tmp/sanity-project',
    ...overrides,
  })
}

describe('startWorkbenchPreview', () => {
  beforeEach(() => {
    mockStartWorkbenchDevServer.mockResolvedValue(mockWorkbenchServer())
    mockServeBuiltApplication.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      host: 'localhost',
      port: 3334,
    })
    mockRegisterDevServer.mockReturnValue({release: vi.fn(), update: vi.fn()})
    mockFindProjectRoot.mockResolvedValue({path: '/tmp/sanity-project/sanity.cli.ts'})
    mockExtractManifest.mockResolvedValue({title: 'Test App'})
    // Default: no id file in the build output, so start falls back to the hash.
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), {code: 'ENOENT'}))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('port coordination', () => {
    test('serves the build on the next port when the workbench claims the configured one', async () => {
      await run()

      expect(mockServeBuiltApplication).toHaveBeenCalledWith(
        expect.objectContaining({httpPort: 3334}),
      )
    })

    test('serves the build on the configured port when no workbench runs', async () => {
      mockStartWorkbenchDevServer.mockResolvedValue(
        mockWorkbenchServer({workbenchAvailable: false}),
      )

      await run()

      expect(mockServeBuiltApplication).toHaveBeenCalledWith(
        expect.objectContaining({httpPort: 3333}),
      )
    })

    test('runs the workbench shell in preview mode', async () => {
      await run()

      expect(mockStartWorkbenchDevServer).toHaveBeenCalledWith(
        expect.objectContaining({mode: 'preview'}),
      )
    })
  })

  describe('registration', () => {
    test('checks the deprecated app id, then registers the built remote with its manifest', async () => {
      await run()

      expect(mockCheckForDeprecatedAppId).toHaveBeenCalled()
      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          // `start` advertises the build id (matching the bundle), not host-port.
          id: await buildAppId(resolveWorkbenchApp(workbenchCliConfig())!),
          manifest: {title: 'Test App'},
          port: 3334,
          type: 'coreApp',
        }),
      )
    })

    test('registers a studio build as a studio', async () => {
      await run({isApp: false})

      expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({type: 'studio'}))
    })

    test('advertises the id the build inlined, so a deploy build (API id) still matches', async () => {
      // A deploy build carries the applications-API id, which start can't recompute.
      mockReadFile.mockResolvedValue('app_deployed_id\n')

      await run()

      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.objectContaining({id: 'app_deployed_id'}),
      )
    })
  })

  describe('teardown', () => {
    test('tears down the workbench and re-throws when the build cannot be served', async () => {
      const workbench = mockWorkbenchServer()
      mockStartWorkbenchDevServer.mockResolvedValue(workbench)
      const serveError = new Error('build not found')
      mockServeBuiltApplication.mockRejectedValue(serveError)

      const thrown = await run().catch((err) => err)

      expect(thrown).toBe(serveError)
      expect(workbench.close).toHaveBeenCalled()
      expect(mockRegisterDevServer).not.toHaveBeenCalled()
    })

    test('tears down both servers and re-throws when registration fails', async () => {
      const workbench = mockWorkbenchServer()
      const remoteClose = vi.fn().mockResolvedValue(undefined)
      mockStartWorkbenchDevServer.mockResolvedValue(workbench)
      mockServeBuiltApplication.mockResolvedValue({
        close: remoteClose,
        host: 'localhost',
        port: 3334,
      })
      const registrationError = new Error('deriveInterfaces failed')
      mockRegisterDevServer.mockImplementation(() => {
        throw registrationError
      })

      const thrown = await run().catch((err) => err)

      expect(thrown).toBe(registrationError)
      expect(workbench.close).toHaveBeenCalled()
      expect(remoteClose).toHaveBeenCalled()
    })

    test('close releases the registration and both servers', async () => {
      const workbench = mockWorkbenchServer()
      const remoteClose = vi.fn().mockResolvedValue(undefined)
      const release = vi.fn()
      mockStartWorkbenchDevServer.mockResolvedValue(workbench)
      mockServeBuiltApplication.mockResolvedValue({
        close: remoteClose,
        host: 'localhost',
        port: 3334,
      })
      mockRegisterDevServer.mockReturnValue({release, update: vi.fn()})

      const {close} = await run()
      await close()

      expect(release).toHaveBeenCalled()
      expect(remoteClose).toHaveBeenCalled()
      expect(workbench.close).toHaveBeenCalled()
    })
  })

  describe('URL announcement', () => {
    test('logs the workbench URL with the build port when the workbench runs', async () => {
      const output = createMockOutput()
      await run({output})

      expect(output.log).toHaveBeenCalledWith(expect.stringContaining('http://localhost:3333'))
    })

    test('shows the existing lock host, not the caller host', async () => {
      mockStartWorkbenchDevServer.mockResolvedValue(mockWorkbenchServer({httpHost: 'mydev.local'}))
      const output = createMockOutput()

      await run({output})

      expect(output.log).toHaveBeenCalledWith(expect.stringContaining('mydev.local:3333'))
    })

    test('announces the build URL directly when no workbench runs', async () => {
      mockStartWorkbenchDevServer.mockResolvedValue(
        mockWorkbenchServer({workbenchAvailable: false}),
      )
      mockServeBuiltApplication.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        host: 'localhost',
        port: 3333,
      })
      const output = createMockOutput()

      await run({output})

      expect(output.log).toHaveBeenCalledWith(expect.stringContaining('http://localhost:3333'))
    })
  })

  describe('signals', () => {
    test('registers signal handlers and removes them on close', async () => {
      const sigintBefore = process.listenerCount('SIGINT')

      const {close} = await run()
      expect(process.listenerCount('SIGINT')).toBe(sigintBefore + 1)

      await close()
      expect(process.listenerCount('SIGINT')).toBe(sigintBefore)
    })
  })
})
