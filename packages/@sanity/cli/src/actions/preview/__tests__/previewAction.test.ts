import {type CliConfig} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMockOutput, workbenchCliConfig} from '../../dev/__tests__/testHelpers.js'
import {previewAction} from '../previewAction.js'

const mockStartWorkbenchPreview = vi.hoisted(() => vi.fn())
const mockStartPreviewServer = vi.hoisted(() => vi.fn())
const mockGetPreviewServerConfig = vi.hoisted(() => vi.fn())
const mockCheckForDeprecatedAppId = vi.hoisted(() => vi.fn())

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
})
