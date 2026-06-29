import {type Output} from '@sanity/cli-core/types'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {buildStudio} from '../buildStudio.js'

const mockWarnAboutMissingAppId = vi.hoisted(() => vi.fn())
const mockGetAppId = vi.hoisted(() => vi.fn())
const mockBuildStudio = vi.hoisted(() =>
  vi.fn().mockImplementation((options) => {
    options.checkAppId()
  }),
)

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

vi.mock('@sanity/cli-build/_internal/build', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    buildStudio: mockBuildStudio,
  }
})

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
})
