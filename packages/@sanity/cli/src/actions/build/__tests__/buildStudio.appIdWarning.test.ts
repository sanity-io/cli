import {type Output} from '@sanity/cli-core/types'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {buildStudio} from '../buildStudio.js'

const mockWarnAboutMissingAppId = vi.hoisted(() => vi.fn())
const mockGetAppId = vi.hoisted(() => vi.fn())
const mockGetLocalPackageVersion = vi.hoisted(() => vi.fn())
const mockGetAutoUpdatesCssUrls = vi.hoisted(() => vi.fn())
const mockGetAutoUpdatesImportMap = vi.hoisted(() => vi.fn())

/** These are not relevant for what we are testing, but still needed to pass type checker */
const FLAGS = {
  'auto-updates': true,
  json: false,
  minify: true,
  'source-maps': true,
  stats: true,
  yes: true,
} as const

// Mock heavy dependencies to isolate appId warning logic
// Paths are relative to the test file location (__tests__/)
vi.mock('../../../util/warnAboutMissingAppId.js', () => ({
  warnAboutMissingAppId: mockWarnAboutMissingAppId,
}))

vi.mock('../../../util/appId.js', () => ({
  getAppId: mockGetAppId,
}))

vi.mock('../../../util/compareDependencyVersions.js', () => ({
  compareDependencyVersions: vi.fn().mockResolvedValue({mismatched: [], unresolvedPrerelease: []}),
}))

vi.mock('@sanity/cli-build/_internal/build', () => ({
  buildDebug: vi.fn(),
  buildStaticFiles: vi.fn().mockResolvedValue({chunks: []}),
  checkRequiredDependencies: vi.fn().mockResolvedValue({installedSanityVersion: '3.0.0'}),
  checkStudioDependencyVersions: vi.fn().mockResolvedValue(undefined),
  getAutoUpdatesCssUrls: mockGetAutoUpdatesCssUrls.mockReturnValue([]),
  getAutoUpdatesImportMap: mockGetAutoUpdatesImportMap.mockReturnValue({}),
  resolveVendorBuildConfig: vi.fn().mockResolvedValue({
    entries: {},
    namesByChunkName: {},
    specifiersByChunkName: {},
  }),
  StudioBuildTrace: {},
}))

vi.mock('@sanity/cli-build/_internal/env', () => ({
  getStudioEnvironmentVariables: vi.fn().mockReturnValue({}),
}))

vi.mock('@sanity/cli-core/telemetry/getCliTelemetry', () => ({
  getCliTelemetry: vi.fn().mockReturnValue({
    trace: vi.fn().mockReturnValue({complete: vi.fn(), log: vi.fn(), start: vi.fn()}),
  }),
}))
vi.mock('@sanity/cli-core/util/getLocalPackageVersion', () => ({
  getLocalPackageVersion: mockGetLocalPackageVersion,
}))
vi.mock('@sanity/cli-core/util/isInteractive', () => ({
  isInteractive: vi.fn().mockReturnValue(false),
}))

vi.mock('@sanity/cli-core/ux', () => ({
  confirm: vi.fn(),
  getTimer: vi.fn().mockReturnValue({end: vi.fn().mockReturnValue(0), start: vi.fn()}),
  logSymbols: {info: 'i', warning: '!'},
  select: vi.fn(),
  spinner: vi.fn(() => ({fail: vi.fn(), start: vi.fn().mockReturnThis(), succeed: vi.fn()})),
}))

function createMockOutput(): Output {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
}

describe('buildStudio appId warning', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should warn about missing appId when auto-updates enabled and not called from deploy', async () => {
    mockGetAppId.mockReturnValue(undefined)
    const output = createMockOutput()

    await buildStudio({
      autoUpdatesEnabled: true,
      cliConfig: {deployment: {autoUpdates: true}},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(mockWarnAboutMissingAppId).toHaveBeenCalledWith(
      expect.objectContaining({appType: 'studio'}),
    )
  })

  test('should not warn about missing appId when called from deploy', async () => {
    mockGetAppId.mockReturnValue(undefined)
    const output = createMockOutput()

    await buildStudio({
      autoUpdatesEnabled: true,
      calledFromDeploy: true,
      cliConfig: {deployment: {autoUpdates: true}},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(mockWarnAboutMissingAppId).not.toHaveBeenCalled()
  })

  test('should not warn about missing appId when auto-updates are disabled', async () => {
    mockGetAppId.mockReturnValue(undefined)
    const output = createMockOutput()

    await buildStudio({
      autoUpdatesEnabled: false,
      cliConfig: {deployment: {autoUpdates: false}},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(mockWarnAboutMissingAppId).not.toHaveBeenCalled()
  })

  test('should not warn about missing appId when appId is configured', async () => {
    mockGetAppId.mockReturnValue('my-app-id')
    const output = createMockOutput()

    await buildStudio({
      autoUpdatesEnabled: true,
      cliConfig: {deployment: {appId: 'my-app-id', autoUpdates: true}},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(mockWarnAboutMissingAppId).not.toHaveBeenCalled()
  })

  test('passes a vision entry with cssFile when @sanity/vision is installed locally', async () => {
    mockGetAppId.mockReturnValue('my-app-id')
    const output = createMockOutput()

    mockGetLocalPackageVersion.mockResolvedValueOnce('3.5.0')

    await buildStudio({
      autoUpdatesEnabled: true,
      cliConfig: {deployment: {appId: 'my-app-id', autoUpdates: true}},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    const sanityDependencies = mockGetAutoUpdatesImportMap.mock.calls[0][0]
    expect(sanityDependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({cssFile: 'index.css', name: 'sanity'}),
        expect.objectContaining({
          cssFile: 'index.css',
          name: '@sanity/vision',
          version: '3.5.0',
        }),
      ]),
    )

    // The same dependency array is passed to getAutoUpdatesCssUrls
    expect(mockGetAutoUpdatesCssUrls.mock.calls[0][0]).toBe(sanityDependencies)
  })
})
