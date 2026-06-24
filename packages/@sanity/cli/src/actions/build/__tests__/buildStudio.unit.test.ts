import {Output} from '@sanity/cli-core'
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
const mockedBuildStaticFiles = vi.hoisted(() => vi.fn())

vi.mock('../../../util/compareDependencyVersions.js', () => ({
  compareDependencyVersions: mockedCompareDependencyVersions,
}))

vi.mock('../../../util/packageManager/upgradePackages.js', () => ({
  upgradePackages: mockedUpgradePackages,
}))

vi.mock('../buildStaticFiles.js', () => ({
  buildStaticFiles: mockedBuildStaticFiles,
}))

vi.mock('@sanity/cli-build/_internal/build', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  return {
    ...original,
    buildDebug: vi.fn(),
    checkRequiredDependencies: vi.fn().mockResolvedValue({installedSanityVersion: '3.0.0'}),
    checkStudioDependencyVersions: vi.fn().mockResolvedValue(undefined),
    getStudioEnvironmentVariables: mockGetStudioEnvironmentVariables,
    resolveVendorBuildConfig: vi.fn().mockResolvedValue({
      entries: {},
      namesByChunkName: {},
      specifiersByChunkName: {},
    }),
    StudioBuildTrace: {},
  }
})

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
    mockedBuildStaticFiles.mockResolvedValue({chunks: []})
    mockedIsInteractive.mockReturnValue(true)
    mockedConfirm.mockResolvedValue(true)
    mockedSelect.mockResolvedValue('upgrade-and-proceed')
    mockedCompareDependencyVersions.mockResolvedValue({mismatched: [], unresolvedPrerelease: []})
    mockedUpgradePackages.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should handle build errors gracefully', async () => {
    const output = createMockOutput()

    mockedBuildStaticFiles.mockImplementation(() => {
      throw new Error('build static files error')
    })

    await buildStudio({
      autoUpdatesEnabled: false,
      cliConfig: {},
      flags: {...FLAGS, yes: true},
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(output.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to build Sanity Studio'),
      {exit: 1},
    )
  })

  test('should prompt for directory cleanup with custom output dir and confirm', async () => {
    const output = createMockOutput()

    const customDir = 'custom-output'
    await buildStudio({
      autoUpdatesEnabled: false,
      cliConfig: {},
      flags: FLAGS,
      outDir: customDir,
      output,
      workDir: '/tmp',
    })

    expect(mockedConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Do you want to delete the existing directory'),
      }),
    )
    expect(mockedSpinner).toHaveBeenCalledWith('Clean output folder')
    expect(mockedBuildStaticFiles).toHaveBeenCalled()
  })

  test('should skip cleanup when user declines directory cleanup prompt', async () => {
    const output = createMockOutput()

    mockedConfirm.mockResolvedValue(false)

    const customDir = 'custom-output'
    await buildStudio({
      autoUpdatesEnabled: false,
      cliConfig: {},
      flags: FLAGS,
      outDir: customDir,
      output,
      workDir: '/tmp',
    })

    expect(mockedSpinner).not.toHaveBeenCalledWith('Clean output folder')
    expect(mockedBuildStaticFiles).toHaveBeenCalled()
  })

  test('should exit when user selects "cancel" for version diff', async () => {
    const output = createMockOutput()

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })
    mockedSelect.mockResolvedValue('cancel')

    await buildStudio({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(output.error).toHaveBeenCalledWith('Declined to continue with build', {exit: 1})
    expect(mockedUpgradePackages).not.toHaveBeenCalled()
  })

  test('should upgrade packages when user selects "upgrade" only', async () => {
    const output = createMockOutput()

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })
    mockedSelect.mockResolvedValue('upgrade')

    await buildStudio({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(mockedUpgradePackages).toHaveBeenCalledWith(
      expect.objectContaining({
        packages: [['sanity', '3.1.0']],
      }),
      expect.any(Object),
    )
    expect(mockedBuildStaticFiles).not.toHaveBeenCalled()
  })

  test('should continue without upgrading when user selects "continue"', async () => {
    const output = createMockOutput()

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })
    mockedSelect.mockResolvedValue('continue')

    await buildStudio({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(mockedUpgradePackages).not.toHaveBeenCalled()
    expect(mockedBuildStaticFiles).toHaveBeenCalled()
  })

  test('should upgrade and build when user selects "upgrade-and-proceed"', async () => {
    const output = createMockOutput()

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })
    mockedSelect.mockResolvedValue('upgrade-and-proceed')

    await buildStudio({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(mockedUpgradePackages).toHaveBeenCalledWith(
      expect.objectContaining({
        packages: [['sanity', '3.1.0']],
      }),
      expect.any(Object),
    )
    expect(mockedBuildStaticFiles).toHaveBeenCalled()
  })

  test('should error in unattended mode when prerelease versions are detected', async () => {
    const output = createMockOutput()

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [],
      unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
    })

    await buildStudio({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: {...FLAGS, yes: true},
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('prerelease versions'), {
      exit: 1,
    })
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('--no-auto-updates'), {
      exit: 1,
    })
    expect(mockedSelect).not.toHaveBeenCalled()
  })

  test('should exit when user selects "cancel" for prerelease prompt', async () => {
    const output = createMockOutput()

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [],
      unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
    })
    mockedSelect.mockResolvedValue('cancel')

    await buildStudio({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(output.error).toHaveBeenCalledWith('Declined to continue with build', {exit: 1})
  })

  test('should build without auto-updates when user selects "disable-auto-updates" for prerelease', async () => {
    const output = createMockOutput()

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [],
      unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
    })
    mockedSelect.mockResolvedValue('disable-auto-updates')

    await buildStudio({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(output.warn).toHaveBeenCalledWith('Auto-updates disabled for this build')
    expect(mockedSpinner).toHaveBeenCalledWith('Build Sanity Studio')

    // Should not have shown the version mismatch prompt
    expect(mockedUpgradePackages).not.toHaveBeenCalled()
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
      flags: FLAGS,
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
