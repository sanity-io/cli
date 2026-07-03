import {type Output} from '@sanity/cli-core'
import {DefinedTelemetryTrace} from '@sanity/telemetry'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type BuildOptions, buildStudio} from '../buildStudio.js'
import {getAutoUpdatesCssUrls, getAutoUpdatesImportMap} from '../getAutoUpdatesImportMap.js'

function buildOptions(
  overrides: Partial<BuildOptions> & Pick<BuildOptions, 'output'>,
): BuildOptions {
  return {
    appId: undefined,
    autoUpdatesEnabled: false,
    checkAppId() {},
    async compareDependencyVersions() {
      return {mismatched: [], unresolvedPrerelease: []}
    },
    determineBasePath() {
      return ''
    },
    isApp: false,
    isWorkbenchApp: false,
    minify: true,
    outDir: '/tmp/dist',
    reactCompiler: undefined,
    schemaExtraction: undefined,
    sourceMap: true,
    stats: true,
    unattendedMode: false,
    async upgradePackages() {},
    vite: undefined,
    workDir: '/tmp',
    ...overrides,
  }
}

const mockedSelect = vi.hoisted(() => vi.fn())
const mockedSpinner = vi.hoisted(() => vi.fn())
const mockedConfirm = vi.hoisted(() => vi.fn())
const mockGetStudioEnvironmentVariables = vi.hoisted(() => vi.fn().mockReturnValue({}))
const mockedIsInteractive = vi.hoisted(() => vi.fn())
const mockedBuildStaticFiles = vi.hoisted(() => vi.fn())
const mockGetLocalPackageVersion = vi.hoisted(() => vi.fn())

vi.mock(import('../buildStaticFiles.js'), () => ({
  buildStaticFiles: mockedBuildStaticFiles,
}))

vi.mock(import('../checkRequiredDependencies.js'), () => ({
  checkRequiredDependencies: vi.fn().mockResolvedValue({installedSanityVersion: '3.0.0'}),
}))

vi.mock(import('../checkStudioDependencyVersions.js'), () => ({
  checkStudioDependencyVersions: vi.fn().mockResolvedValue(undefined),
}))

vi.mock(import('../getAutoUpdatesImportMap.js'), () => ({
  getAutoUpdatesCssUrls: vi.fn(),
  getAutoUpdatesImportMap: vi.fn(),
}))

vi.mock(import('../resolveVendorBuildConfig.js'), () => ({
  resolveVendorBuildConfig: vi.fn().mockResolvedValue({
    entries: {},
    namesByChunkName: {},
    specifiersByChunkName: {},
  }),
}))

vi.mock(import('../../../telemetry/build.telemetry.js'), () => ({
  StudioBuildTrace: {} as DefinedTelemetryTrace<
    {
      outputSize: number
    },
    void
  >,
}))

vi.mock(import('../getEnvironmentVariables.js'), () => ({
  getStudioEnvironmentVariables: mockGetStudioEnvironmentVariables,
}))

vi.mock(import('@sanity/cli-core'), async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    getLocalPackageVersion: mockGetLocalPackageVersion,
    isInteractive: mockedIsInteractive,
  }
})

vi.mock(import('@sanity/cli-core/ux'), async (importOriginal) => {
  const original = await importOriginal()
  mockedSpinner.mockImplementation(original.spinner)
  return {
    ...original,
    confirm: mockedConfirm,
    select: mockedSelect,
    spinner: mockedSpinner,
  }
})

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
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should handle build errors gracefully', async () => {
    const output = createMockOutput()

    mockedBuildStaticFiles.mockImplementation(() => {
      throw new Error('build static files error')
    })

    await buildStudio(buildOptions({output, unattendedMode: true}))

    expect(output.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to build Sanity Studio'),
      {exit: 1},
    )
  })

  test('should prompt for directory cleanup with custom output dir and confirm', async () => {
    const output = createMockOutput()

    const customDir = 'custom-output'
    await buildStudio(buildOptions({outDir: customDir, output}))

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
    await buildStudio(buildOptions({outDir: customDir, output}))

    expect(mockedSpinner).not.toHaveBeenCalledWith('Clean output folder')
    expect(mockedBuildStaticFiles).toHaveBeenCalled()
  })

  test('should exit when user selects "cancel" for version diff', async () => {
    const output = createMockOutput()

    mockedSelect.mockResolvedValue('cancel')

    let upgradePackagesCalled = false
    await buildStudio(
      buildOptions({
        autoUpdatesEnabled: true,
        compareDependencyVersions: async () => ({
          mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
          unresolvedPrerelease: [],
        }),
        output,
        async upgradePackages() {
          upgradePackagesCalled = true
        },
      }),
    )

    expect(mockedSelect).toHaveBeenCalled()
    expect(output.error).toHaveBeenCalledWith('Declined to continue with build', {exit: 1})
    expect(upgradePackagesCalled).toBeFalsy()
  })

  test('should upgrade packages when user selects "upgrade" only', async () => {
    const output = createMockOutput()

    const mockedUpgradePackages = vi.fn()
    mockedSelect.mockResolvedValue('upgrade')

    await buildStudio(
      buildOptions({
        autoUpdatesEnabled: true,
        compareDependencyVersions: async () => ({
          mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
          unresolvedPrerelease: [],
        }),
        output,
        upgradePackages: mockedUpgradePackages,
      }),
    )

    expect(mockedSelect).toHaveBeenCalled()
    expect(mockedUpgradePackages).toHaveBeenCalledWith(
      expect.objectContaining({
        packages: [['sanity', '3.1.0']],
      }),
    )
    expect(mockedBuildStaticFiles).not.toHaveBeenCalled()
  })

  test('should continue without upgrading when user selects "continue"', async () => {
    const output = createMockOutput()

    const mockedUpgradePackages = vi.fn()
    mockedSelect.mockResolvedValue('continue')

    await buildStudio(
      buildOptions({
        autoUpdatesEnabled: true,
        compareDependencyVersions: async () => ({
          mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
          unresolvedPrerelease: [],
        }),
        output,
      }),
    )

    expect(mockedUpgradePackages).not.toHaveBeenCalled()
    expect(mockedBuildStaticFiles).toHaveBeenCalled()
  })

  test('should upgrade and build when user selects "upgrade-and-proceed"', async () => {
    const output = createMockOutput()

    const mockedUpgradePackages = vi.fn()
    mockedSelect.mockResolvedValue('upgrade-and-proceed')

    await buildStudio(
      buildOptions({
        autoUpdatesEnabled: true,
        compareDependencyVersions: async () => ({
          mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
          unresolvedPrerelease: [],
        }),
        output,
        upgradePackages: mockedUpgradePackages,
      }),
    )

    expect(mockedUpgradePackages).toHaveBeenCalledWith(
      expect.objectContaining({
        packages: [['sanity', '3.1.0']],
      }),
    )
    expect(mockedBuildStaticFiles).toHaveBeenCalled()
  })

  test('should error in unattended mode when prerelease versions are detected', async () => {
    const output = createMockOutput()

    await buildStudio(
      buildOptions({
        autoUpdatesEnabled: true,
        compareDependencyVersions: async () => ({
          mismatched: [],
          unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
        }),
        output,
        unattendedMode: true,
      }),
    )

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

    mockedSelect.mockResolvedValue('cancel')

    await buildStudio(
      buildOptions({
        autoUpdatesEnabled: true,
        compareDependencyVersions: async () => ({
          mismatched: [],
          unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
        }),
        output,
      }),
    )

    expect(output.error).toHaveBeenCalledWith('Declined to continue with build', {exit: 1})
  })

  test('should build without auto-updates when user selects "disable-auto-updates" for prerelease', async () => {
    const output = createMockOutput()

    const mockedUpgradePackages = vi.fn()
    mockedSelect.mockResolvedValue('disable-auto-updates')

    await buildStudio(
      buildOptions({
        autoUpdatesEnabled: true,
        compareDependencyVersions: async () => ({
          mismatched: [],
          unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
        }),
        output,
      }),
    )

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

    await buildStudio(buildOptions({output}))

    expect(mockGetStudioEnvironmentVariables).toHaveBeenCalled()
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('SANITY_STUDIO_TEST_VAR'))
  })

  test('should skip version mismatch prompt after disabling auto-updates for prerelease', async () => {
    const output = createMockOutput()

    // First select call is for prerelease prompt
    mockedSelect.mockResolvedValue('disable-auto-updates')
    const mockedUpgradePackages = vi.fn()

    await buildStudio(
      buildOptions({
        autoUpdatesEnabled: true,
        compareDependencyVersions: async () => ({
          mismatched: [{installed: '3.0.0', pkg: '@sanity/vision', remote: '3.1.0'}],
          unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
        }),
        output,
      }),
    )

    expect(mockedSpinner).toHaveBeenCalledWith('Build Sanity Studio')
    // select should only be called once (for the prerelease prompt), not twice
    expect(mockedSelect).toHaveBeenCalledTimes(1)
    expect(mockedUpgradePackages).not.toHaveBeenCalled()
  })

  test('should skip version prompt in unattended mode and show warning', async () => {
    const output = createMockOutput()

    await buildStudio(
      buildOptions({
        autoUpdatesEnabled: true,
        compareDependencyVersions: async () => ({
          mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
          unresolvedPrerelease: [],
        }),
        output,
        unattendedMode: true,
      }),
    )

    expect(mockedSelect).not.toHaveBeenCalled()
    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining('local version: 3.0.0, runtime version: 3.1.0'),
    )
    expect(mockedSpinner).toHaveBeenCalledWith('Build Sanity Studio')
  })

  test('should skip version prompt in non-interactive mode and show warning', async () => {
    const output = createMockOutput()

    mockedIsInteractive.mockReturnValue(false)

    await buildStudio(
      buildOptions({
        autoUpdatesEnabled: true,
        compareDependencyVersions: async () => ({
          mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
          unresolvedPrerelease: [],
        }),
        output,
      }),
    )

    expect(mockedSelect).not.toHaveBeenCalled()
    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining('local version: 3.0.0, runtime version: 3.1.0'),
    )
    expect(mockedSpinner).toHaveBeenCalledWith('Build Sanity Studio')
  })

  test('passes a vision entry with cssFile when @sanity/vision is installed locally', async () => {
    const output = createMockOutput()

    mockGetLocalPackageVersion.mockResolvedValueOnce('3.5.0')

    await buildStudio(buildOptions({appId: 'my-app-id', autoUpdatesEnabled: true, output}))

    const sanityDependencies = vi.mocked(getAutoUpdatesImportMap).mock.calls[0][0]
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
    expect(vi.mocked(getAutoUpdatesCssUrls).mock.calls[0][0]).toBe(sanityDependencies)
  })

  test('should not check appId when auto-updates are disabled', async () => {
    const output = createMockOutput()

    const mockCheckAppId = vi.fn()

    await buildStudio(buildOptions({checkAppId: mockCheckAppId, output}))

    expect(mockCheckAppId).not.toHaveBeenCalled()
  })

  test('should check appId when auto-updates are enabled', async () => {
    const output = createMockOutput()

    const mockCheckAppId = vi.fn()

    await buildStudio(buildOptions({autoUpdatesEnabled: true, checkAppId: mockCheckAppId, output}))

    expect(mockCheckAppId).toHaveBeenCalled()
  })
})
