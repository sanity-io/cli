import {Output} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

const FLAGS = {
  'auto-updates': true,
  json: false,
  minify: true,
  'source-maps': true,
  stats: true,
  yes: false,
} as const

const mockedSelect = vi.hoisted(() => vi.fn())
const mockedSpinner = vi.hoisted(() => vi.fn())
const mockedConfirm = vi.hoisted(() => vi.fn())
const mockedCompareDependencyVersions = vi.hoisted(() => vi.fn())
const mockGetStudioEnvironmentVariables = vi.hoisted(() => vi.fn().mockReturnValue({}))
const mockedUpgradePackages = vi.hoisted(() => vi.fn())
const mockedIsInteractive = vi.hoisted(() => vi.fn())

vi.mock('../../../util/compareDependencyVersions.js', () => ({
  compareDependencyVersions: mockedCompareDependencyVersions,
}))

vi.mock('../../../util/packageManager/upgradePackages.js', () => ({
  upgradePackages: mockedUpgradePackages,
}))

vi.mock('../buildStaticFiles.js', () => ({
  buildStaticFiles: vi.fn().mockResolvedValue({chunks: []}),
}))

vi.mock('../checkRequiredDependencies.js', () => ({
  checkRequiredDependencies: vi.fn().mockResolvedValue({installedSanityVersion: '3.0.0'}),
}))

vi.mock('../getEnvironmentVariables.js', () => ({
  getStudioEnvironmentVariables: mockGetStudioEnvironmentVariables,
}))

vi.mock('@sanity/cli-build/_internal/build', () => ({
  buildDebug: vi.fn(),
  checkStudioDependencyVersions: vi.fn().mockResolvedValue(undefined),
  resolveVendorBuildConfig: vi.fn().mockResolvedValue({
    entries: {},
    namesByChunkName: {},
    specifiersByChunkName: {},
  }),
  StudioBuildTrace: {},
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...original,
    isInteractive: mockedIsInteractive,
  }
})

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  mockedSpinner.mockImplementation(original.spinner)
  return {
    ...original,
    confirm: mockedConfirm,
    select: mockedSelect,
    spinner: mockedSpinner,
  }
})

// Import after mocks are set up
const {buildStudio} = await import('../buildStudio.js')

function createMockOutput(): Output {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
}

describe('#buildStudio', () => {
  beforeEach(() => {
    mockedIsInteractive.mockReturnValue(true)
    mockedConfirm.mockResolvedValue(true)
    mockedSelect.mockResolvedValue('upgrade-and-proceed')
    mockedCompareDependencyVersions.mockResolvedValue({mismatched: [], unresolvedPrerelease: []})
    mockedUpgradePackages.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('outputs included environment variables', async () => {
    const output = createMockOutput()

    mockGetStudioEnvironmentVariables.mockImplementation(() => ({
      SANITY_STUDIO_TEST_VAR: 'test-value',
    }))

    await buildStudio({
      autoUpdatesEnabled: false,
      cliConfig: {},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('SANITY_STUDIO_TEST_VAR'))
  })

  test('should skip version mismatch prompt after disabling auto-updates for prerelease', async () => {
    const output = createMockOutput()

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: '@sanity/vision', remote: '3.1.0'}],
      unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
    })
    // First select call is for prerelease prompt
    mockedSelect.mockResolvedValue('disable-auto-updates')

    await buildStudio({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(mockedSpinner).toHaveBeenCalledWith('Build Sanity Studio')
    // select should only be called once (for the prerelease prompt), not twice
    expect(mockedSelect).toHaveBeenCalledTimes(1)
    expect(mockedUpgradePackages).not.toHaveBeenCalled()
  })

  test('should skip version prompt in unattended mode and show warning', async () => {
    const output = createMockOutput()

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })

    await buildStudio({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: {...FLAGS, yes: true},
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(mockedSelect).not.toHaveBeenCalled()
    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining('local version: 3.0.0, runtime version: 3.1.0'),
    )
    expect(mockedSpinner).toHaveBeenCalledWith('Build Sanity Studio')
  })

  test('should skip version prompt in non-interactive mode and show warning', async () => {
    const output = createMockOutput()

    mockedIsInteractive.mockReturnValue(false)
    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })

    await buildStudio({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: {...FLAGS, yes: true},
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(mockedSelect).not.toHaveBeenCalled()
    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining('local version: 3.0.0, runtime version: 3.1.0'),
    )
    expect(mockedSpinner).toHaveBeenCalledWith('Build Sanity Studio')
  })
})
