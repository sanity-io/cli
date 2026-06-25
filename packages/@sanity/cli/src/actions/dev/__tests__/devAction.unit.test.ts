import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {devAction} from '../devAction.js'
import {createBaseDevOptions, workbenchCliConfig} from './testHelpers.js'

const mockStartWorkbenchDev = vi.hoisted(() => vi.fn())
const mockStartAppDevServer = vi.hoisted(() => vi.fn())
const mockStartStudioDevServer = vi.hoisted(() => vi.fn())
const mockGetSharedServerConfig = vi.hoisted(() => vi.fn())
const mockGetAppId = vi.hoisted(() => vi.fn())
const mockCheckForDeprecatedAppId = vi.hoisted(() => vi.fn())

// The workbench orchestration lives in workbench-cli and is imported lazily —
// mock the single entry the dispatcher delegates to.
vi.mock('@sanity/workbench-cli/dev', () => ({startWorkbenchDev: mockStartWorkbenchDev}))
vi.mock('../servers/startAppDevServer.js', () => ({startAppDevServer: mockStartAppDevServer}))
vi.mock('../servers/startStudioDevServer.js', () => ({
  startStudioDevServer: mockStartStudioDevServer,
}))
vi.mock('../../../util/getSharedServerConfig.js', () => ({
  getSharedServerConfig: mockGetSharedServerConfig,
}))
vi.mock('../../../util/appId.js', () => ({
  checkForDeprecatedAppId: mockCheckForDeprecatedAppId,
  getAppId: mockGetAppId,
}))

/** Minimal started app/studio dev server result. */
function mockServer({port = 3334}: {port?: number} = {}) {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    server: {config: {server: {port}}},
    started: true,
  }
}

describe('devAction', () => {
  beforeEach(() => {
    mockGetSharedServerConfig.mockReturnValue({httpHost: 'localhost', httpPort: 3333})
    mockGetAppId.mockReturnValue(undefined)
    mockStartWorkbenchDev.mockResolvedValue({close: vi.fn().mockResolvedValue(undefined)})
    mockStartStudioDevServer.mockResolvedValue(mockServer({port: 3333}))
    mockStartAppDevServer.mockResolvedValue(mockServer({port: 3333}))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  describe('plain (non-workbench) projects', () => {
    test('starts the studio dev server directly and never delegates to the workbench', async () => {
      const result = await devAction(createBaseDevOptions())

      expect(mockStartStudioDevServer).toHaveBeenCalledWith(
        expect.objectContaining({announceUrl: true}),
      )
      expect(mockStartWorkbenchDev).not.toHaveBeenCalled()
      expect(result.close).toBeTypeOf('function')
    })

    test('returns a no-op close when the app server reports an expected early exit', async () => {
      mockStartAppDevServer.mockResolvedValue({reason: 'missing-organization-id', started: false})

      const result = await devAction(createBaseDevOptions({isApp: true}))

      await expect(result.close()).resolves.toBeUndefined()
      expect(mockStartWorkbenchDev).not.toHaveBeenCalled()
    })
  })

  describe('workbench projects', () => {
    test('delegates to startWorkbenchDev with the injected CLI-domain pieces', async () => {
      mockGetAppId.mockReturnValue('app-abc')
      const orchestratorClose = vi.fn().mockResolvedValue(undefined)
      mockStartWorkbenchDev.mockResolvedValue({close: orchestratorClose})

      const result = await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig()}))

      expect(mockStartStudioDevServer).not.toHaveBeenCalled()
      expect(mockStartWorkbenchDev).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: 'app-abc',
          cacheDir: expect.stringMatching(/\/vite$/),
          checkForDeprecatedAppId: expect.any(Function),
          extractManifest: expect.any(Function),
          httpHost: 'localhost',
          httpPort: 3333,
          isApp: false,
          reactStrictMode: expect.any(Boolean),
          startAppServer: expect.any(Function),
        }),
      )
      // The orchestrator's close is handed straight back.
      expect(result.close).toBe(orchestratorClose)
    })

    test('passes isApp: true through for app mode', async () => {
      await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig(), isApp: true}))

      expect(mockStartWorkbenchDev).toHaveBeenCalledWith(expect.objectContaining({isApp: true}))
    })

    test('the injected startAppServer dispatches to the studio server and forwards intent', async () => {
      await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig()}))

      const {startAppServer} = mockStartWorkbenchDev.mock.calls[0][0]
      const config = workbenchCliConfig()
      await startAppServer({announceUrl: false, cliConfig: config, httpPort: 3334})

      expect(mockStartStudioDevServer).toHaveBeenCalledWith(
        expect.objectContaining({announceUrl: false, cliConfig: config, httpPort: 3334}),
      )
    })

    test('the injected startAppServer dispatches to the app server in app mode', async () => {
      await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig(), isApp: true}))

      const {startAppServer} = mockStartWorkbenchDev.mock.calls[0][0]
      await startAppServer({announceUrl: false, cliConfig: workbenchCliConfig(), httpPort: 3334})

      expect(mockStartAppDevServer).toHaveBeenCalledWith(
        expect.objectContaining({announceUrl: false, httpPort: 3334}),
      )
    })
  })

  describe('workbench remote', () => {
    // devAction no longer special-cases the remote: every workbench app routes to
    // startWorkbenchDev, which runs the remote (it can't render itself) as a plain
    // server internally.
    test('still routes to startWorkbenchDev with the remote flag set', async () => {
      vi.stubEnv('SANITY_INTERNAL_IS_WORKBENCH_REMOTE', 'true')

      await devAction(createBaseDevOptions({cliConfig: workbenchCliConfig(), isApp: true}))

      expect(mockStartWorkbenchDev).toHaveBeenCalled()
    })
  })
})
