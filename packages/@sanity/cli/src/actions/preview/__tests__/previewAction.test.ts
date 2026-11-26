import {type CliConfig} from '@sanity/cli-core'
import {defineDashboard, unstable_defineMediaLibrary} from '@sanity/workbench-cli'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMockOutput, workbenchCliConfig} from '../../dev/__tests__/testHelpers.js'
import {previewAction} from '../previewAction.js'

const mockStartWorkbenchPreview = vi.hoisted(() => vi.fn())
const mockStartPreviewServer = vi.hoisted(() => vi.fn())
const mockGetPreviewServerConfig = vi.hoisted(() => vi.fn())
const mockCheckForDeprecatedAppId = vi.hoisted(() => vi.fn())
const mockExtractCoreAppManifest = vi.hoisted(() => vi.fn())

vi.mock(import('@sanity/cli-build/_internal/manifest'), async (importOriginal) => ({
  ...(await importOriginal()),
  extractCoreAppManifest: mockExtractCoreAppManifest,
}))

// The workbench orchestration lives in workbench-cli and is imported lazily —
// mock the single entry the action delegates to.
vi.mock('@sanity/workbench-cli/preview', () => ({
  startWorkbenchPreview: mockStartWorkbenchPreview,
}))
vi.mock('../../../server/previewServer.js', () => ({startPreviewServer: mockStartPreviewServer}))
vi.mock('../getPreviewServerConfig.js', () => ({
  getPreviewServerConfig: mockGetPreviewServerConfig,
}))
vi.mock('../../../util/appId.js', () => ({
  checkForDeprecatedAppId: mockCheckForDeprecatedAppId,
}))

function options(overrides: Partial<Parameters<typeof previewAction>[0]> = {}) {
  return {
    cliConfig: {} as CliConfig,
    flags: {host: undefined, json: undefined, port: undefined},
    outDir: '/tmp/project/dist',
    output: createMockOutput(),
    workDir: '/tmp/project',
    ...overrides,
  }
}

describe('previewAction', () => {
  beforeEach(() => {
    mockGetPreviewServerConfig.mockReturnValue({
      httpHost: 'localhost',
      httpPort: 3333,
      root: '/tmp/project/dist',
      workDir: '/tmp/project',
    })
    mockStartPreviewServer.mockResolvedValue({close: vi.fn(), urls: {local: [], network: []}})
    mockStartWorkbenchPreview.mockResolvedValue({close: vi.fn().mockResolvedValue(undefined)})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('serves a plain build with the static preview server and never delegates to the workbench', async () => {
    await previewAction(options())

    expect(mockStartPreviewServer).toHaveBeenCalled()
    expect(mockStartWorkbenchPreview).not.toHaveBeenCalled()
  })

  test('delegates a media library config to startWorkbenchPreview', async () => {
    await previewAction(
      options({
        cliConfig: {app: unstable_defineMediaLibrary({organizationId: 'org-1'})} as CliConfig,
      }),
    )

    expect(mockStartWorkbenchPreview).toHaveBeenCalled()
    expect(mockStartPreviewServer).not.toHaveBeenCalled()
  })

  test('delegates a dashboard configuration to startWorkbenchPreview', async () => {
    await previewAction(
      options({
        cliConfig: {
          app: defineDashboard({organizationId: 'org-1', src: './src/dashboard.ts'}),
        } as CliConfig,
      }),
    )

    expect(mockStartWorkbenchPreview).toHaveBeenCalled()
    expect(mockStartPreviewServer).not.toHaveBeenCalled()
  })

  test('delegates a workbench app to startWorkbenchPreview with the injected CLI-domain pieces', async () => {
    const previewClose = vi.fn().mockResolvedValue(undefined)
    mockStartWorkbenchPreview.mockResolvedValue({close: previewClose})

    const result = await previewAction(options({cliConfig: workbenchCliConfig()}))

    expect(mockStartPreviewServer).not.toHaveBeenCalled()
    expect(mockStartWorkbenchPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheDir: expect.stringMatching(/\/vite$/),
        checkForDeprecatedAppId: expect.any(Function),
        extractManifest: expect.any(Function),
        httpHost: 'localhost',
        httpPort: 3333,
        // Derived inside the workbench branch via determineIsApp, not passed in.
        isApp: true,
        outDir: '/tmp/project/dist',
        reactStrictMode: expect.any(Boolean),
      }),
    )
    expect(result.close).toBe(previewClose)
  })

  test("points the app manifest's icon at the URL the preview serves it from", async () => {
    await previewAction(options({cliConfig: workbenchCliConfig()}))
    const {extractManifest} = mockStartWorkbenchPreview.mock.calls[0][0]

    await extractManifest({
      configPath: '/tmp/project/sanity.cli.ts',
      iconUrl: 'http://localhost:3334/public/icon.png',
      workDir: '/tmp/project',
    })

    expect(mockExtractCoreAppManifest).toHaveBeenCalledWith({
      iconUrl: 'http://localhost:3334/public/icon.png',
      workDir: '/tmp/project',
    })
  })
})
