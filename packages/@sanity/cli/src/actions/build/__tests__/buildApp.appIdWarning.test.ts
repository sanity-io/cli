import {type CliConfig, type Output} from '@sanity/cli-core'
import {defineApplication} from '@sanity/workbench-cli'
import {afterEach, describe, expect, test, vi} from 'vitest'

const mockWarnAboutMissingAppId = vi.hoisted(() => vi.fn())
const mockGetAppId = vi.hoisted(() => vi.fn())
const mockedBuildApp = vi.hoisted(() =>
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
vi.mock(import('../../../util/warnAboutMissingAppId.js'), () => ({
  warnAboutMissingAppId: mockWarnAboutMissingAppId,
}))

vi.mock(import('../../../util/appId.js'), () => ({
  getAppId: mockGetAppId,
}))

vi.mock(import('@sanity/cli-build/_internal/build'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    buildApp: mockedBuildApp,
    compareDependencyVersions: vi
      .fn()
      .mockResolvedValue({mismatched: [], unresolvedPrerelease: []}),
  }
})

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
      autoUpdatesEnabled: true,
      cliConfig: {deployment: {autoUpdates: true}},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(mockWarnAboutMissingAppId).toHaveBeenCalledWith(
      expect.objectContaining({appType: 'app'}),
    )
  })

  test('should not warn about missing appId when called from deploy', async () => {
    mockGetAppId.mockReturnValue(undefined)
    const output = createMockOutput()

    await buildApp({
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

    await buildApp({
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

describe('buildApp workbench app id', () => {
  const app = defineApplication({
    organizationId: 'oSyH1iET5',
    slug: 'drop-desk',
    title: 'Drop Desk',
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test.each([
    {
      applicationId: 'k8f2xq9wz1c4m7v0n3b6h5j2',
      deployment: {appId: 'v27rvqtlp3lmdvcln6ey3lro'},
      expected: 'k8f2xq9wz1c4m7v0n3b6h5j2',
      rule: "the deploy's application id over the configured one",
    },
    {
      applicationId: undefined,
      deployment: {appId: 'v27rvqtlp3lmdvcln6ey3lro'},
      expected: 'v27rvqtlp3lmdvcln6ey3lro',
      rule: 'the configured deployment app id',
    },
    {
      applicationId: undefined,
      deployment: undefined,
      expected: 'drop-desk',
      rule: 'the slug without an app id',
    },
  ])('inlines $rule', async ({applicationId, deployment, expected}) => {
    await buildApp({
      applicationId,
      autoUpdatesEnabled: false,
      cliConfig: {app, deployment} as CliConfig,
      flags: FLAGS,
      outDir: '/tmp/dist',
      output: createMockOutput(),
      workDir: '/tmp',
    })

    expect(mockedBuildApp).toHaveBeenCalledWith(expect.objectContaining({workbenchAppId: expected}))
  })
})
