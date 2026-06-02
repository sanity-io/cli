import {type Output} from '@sanity/cli-core'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {BuildOptions} from '../buildApp.js'

const mockWarnAboutMissingAppId = vi.hoisted(() => vi.fn())
const mockGetAppId = vi.hoisted(() => vi.fn())

/** These are not relevant for what we are testing, but still needed to pass type checker */
const buildOptions: Omit<BuildOptions, 'output'> = {
  appId: undefined,
  appTitle: undefined,
  autoUpdatesEnabled: true,
  buildViteReactPlugin: () => [],
  calledFromDeploy: false,
  determineBasePath: () => '/',
  entry: undefined,
  getEnvironmentVariables: () => ({}),
  minify: true,
  outDir: '/tmp/dist',
  schemaExtraction: undefined,
  sourceMap: true,
  stats: true,
  unattendedMode: true,
  vite: undefined,
  workDir: '/tmp',
}

// Mock heavy dependencies to isolate appId warning logic
// Paths are relative to the test file location (__tests__/)
vi.mock('../../../telemetry/build.telemetry.js', () => ({
  AppBuildTrace: {},
}))

vi.mock('../../../util/warnAboutMissingAppId.js', () => ({
  warnAboutMissingAppId: mockWarnAboutMissingAppId,
}))

vi.mock('../../../util/appId.js', () => ({
  getAppId: mockGetAppId,
}))

vi.mock('../../../util/compareDependencyVersions.js', () => ({
  compareDependencyVersions: vi.fn().mockResolvedValue({mismatched: [], unresolvedPrerelease: []}),
}))

vi.mock('../getAutoUpdatesImportMap.js', () => ({
  getAutoUpdatesCssUrls: vi.fn().mockReturnValue([]),
  getAutoUpdatesImportMap: vi.fn().mockReturnValue({}),
}))

vi.mock('../getEnvironmentVariables.js', () => ({
  getAppEnvironmentVariables: vi.fn().mockReturnValue({}),
}))

vi.mock('../buildStaticFiles.js', () => ({
  buildStaticFiles: vi.fn().mockResolvedValue({chunks: []}),
}))

vi.mock('../buildVendorDependencies.js', () => ({
  buildVendorDependencies: vi.fn().mockResolvedValue({}),
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getCliTelemetry: vi.fn().mockReturnValue({
      trace: vi.fn().mockReturnValue({complete: vi.fn(), log: vi.fn(), start: vi.fn()}),
    }),
    getLocalPackageVersion: vi.fn().mockResolvedValue('1.0.0'),
    getTimer: vi.fn().mockReturnValue({end: vi.fn().mockReturnValue(0), start: vi.fn()}),
    isInteractive: vi.fn().mockReturnValue(false),
  }
})

vi.mock('@sanity/cli-core/ux', () => ({
  confirm: vi.fn(),
  logSymbols: {info: 'i', warning: '!'},
  spinner: vi.fn(() => ({fail: vi.fn(), start: vi.fn().mockReturnThis(), succeed: vi.fn()})),
}))

// Import after mocks are set up
const {buildApp} = await import('../buildApp.js')

function createMockOutput(): Output {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
}

describe('buildApp appId warning', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should warn about missing appId when auto-updates enabled and not called from deploy', async () => {
    mockGetAppId.mockReturnValue(undefined)
    const output = createMockOutput()

    await buildApp({
      ...buildOptions,
      autoUpdatesEnabled: true,
      output,
    })

    expect(mockWarnAboutMissingAppId).toHaveBeenCalledWith(
      expect.objectContaining({appType: 'app'}),
    )
  })

  test('should not warn about missing appId when called from deploy', async () => {
    mockGetAppId.mockReturnValue(undefined)
    const output = createMockOutput()

    await buildApp({
      ...buildOptions,
      autoUpdatesEnabled: true,
      calledFromDeploy: true,
      output,
    })

    expect(mockWarnAboutMissingAppId).not.toHaveBeenCalled()
  })

  test('should not warn about missing appId when auto-updates are disabled', async () => {
    mockGetAppId.mockReturnValue(undefined)
    const output = createMockOutput()

    await buildApp({
      ...buildOptions,
      autoUpdatesEnabled: false,
      output,
    })

    expect(mockWarnAboutMissingAppId).not.toHaveBeenCalled()
  })

  test('should not warn about missing appId when appId is configured', async () => {
    mockGetAppId.mockReturnValue('my-app-id')
    const output = createMockOutput()

    await buildApp({
      ...buildOptions,
      appId: 'my-app-id',
      autoUpdatesEnabled: true,
      output,
    })

    expect(mockWarnAboutMissingAppId).not.toHaveBeenCalled()
  })
})
