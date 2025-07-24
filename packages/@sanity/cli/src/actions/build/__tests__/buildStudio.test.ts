import {rm} from 'node:fs/promises'
import path from 'node:path'

import {logSymbols, type Output} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, it, type MockedFunction, vi} from 'vitest'

import {buildStudio} from '../buildStudio.js'
import {type BuildOptions} from '../types.js'

vi.mock('node:fs/promises')
vi.mock('@sanity/cli-core', async () => {
  const original = await import('@sanity/cli-core')
  return {
    ...original,
    spinner: vi.fn(() => ({
      fail: vi.fn().mockReturnThis(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
      text: '',
    })),
  }
})

const mockedRm = rm as MockedFunction<typeof rm>
const mockedConfirm = vi.hoisted(() => vi.fn())
const mockedSelect = vi.hoisted(() => vi.fn())
const mockedCompareDependencyVersions = vi.hoisted(() => vi.fn())
const mockedGetPackageManagerChoice = vi.hoisted(() => vi.fn())
const mockedUpgradePackages = vi.hoisted(() => vi.fn())
const mockedBuildStaticFiles = vi.hoisted(() => vi.fn())
const mockedBuildVendorDependencies = vi.hoisted(() => vi.fn())
const mockedCheckRequiredDependencies = vi.hoisted(() => vi.fn())
const mockedCheckStudioDependencyVersions = vi.hoisted(() => vi.fn())
const mockedDetermineBasePath = vi.hoisted(() => vi.fn())
const mockedGetStudioAutoUpdateImportMap = vi.hoisted(() => vi.fn())
const mockedGetStudioEnvVars = vi.hoisted(() => vi.fn())
const mockedShouldAutoUpdate = vi.hoisted(() => vi.fn())

vi.mock('@inquirer/prompts', () => ({
  confirm: mockedConfirm,
  select: mockedSelect,
}))

vi.mock('../../../util/compareDependencyVersions.js', () => ({
  compareDependencyVersions: mockedCompareDependencyVersions,
}))

vi.mock('../../../util/packageManager/packageManagerChoice.js', () => ({
  getPackageManagerChoice: mockedGetPackageManagerChoice,
}))

vi.mock('../../../util/packageManager/upgradePackages.js', () => ({
  upgradePackages: mockedUpgradePackages,
}))

vi.mock('../buildStaticFiles.js', () => ({
  buildStaticFiles: mockedBuildStaticFiles,
}))

vi.mock('../buildVendorDependencies.js', () => ({
  buildVendorDependencies: mockedBuildVendorDependencies,
}))

vi.mock('../checkRequiredDependencies.js', () => ({
  checkRequiredDependencies: mockedCheckRequiredDependencies,
}))

vi.mock('../checkStudioDependencyVersions.js', () => ({
  checkStudioDependencyVersions: mockedCheckStudioDependencyVersions,
}))

vi.mock('../determineBasePath.js', () => ({
  determineBasePath: mockedDetermineBasePath,
}))

vi.mock('../getAutoUpdatesImportMap.js', () => ({
  getStudioAutoUpdateImportMap: mockedGetStudioAutoUpdateImportMap,
}))

vi.mock('../getStudioEnvVars.js', () => ({
  getStudioEnvVars: mockedGetStudioEnvVars,
}))

vi.mock('../shouldAutoUpdate.js', () => ({
  shouldAutoUpdate: mockedShouldAutoUpdate,
}))

describe('buildStudio', () => {
  const mockOutput = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output

  const baseBuildOptions: BuildOptions = {
    autoUpdatesEnabled: false,
    cliConfig: {},
    exit: vi.fn(),
    flags: {
      'auto-updates': false,
      json: false,
      minify: false,
      'source-maps': false,
      stats: false,
      yes: false,
    },
    outDir: undefined,
    output: mockOutput,
    workDir: '/test/work/dir',
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mocks
    mockedCheckStudioDependencyVersions.mockResolvedValue(undefined)
    mockedCheckRequiredDependencies.mockResolvedValue({
      didInstall: false,
      installedSanityVersion: '3.0.0',
    })
    mockedShouldAutoUpdate.mockReturnValue(false)
    mockedGetStudioAutoUpdateImportMap.mockReturnValue({})
    mockedCompareDependencyVersions.mockResolvedValue([])
    mockedGetStudioEnvVars.mockReturnValue([])
    mockedDetermineBasePath.mockReturnValue('/studio')
    mockedBuildVendorDependencies.mockResolvedValue({})
    mockedBuildStaticFiles.mockResolvedValue({
      chunks: [],
    })
    mockedRm.mockResolvedValue(undefined)
    mockedGetPackageManagerChoice.mockResolvedValue({
      chosen: 'npm',
    })
    mockedUpgradePackages.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should build studio successfully with basic options', async () => {
    await buildStudio(baseBuildOptions)

    expect(mockedCheckStudioDependencyVersions).toHaveBeenCalledWith('/test/work/dir', mockOutput)
    expect(mockedCheckRequiredDependencies).toHaveBeenCalledWith({
      cliConfig: {},
      output: mockOutput,
      workDir: '/test/work/dir',
    })
    expect(mockedBuildStaticFiles).toHaveBeenCalled()
  })

  it('should exit early when dependencies were installed', async () => {
    mockedCheckRequiredDependencies.mockResolvedValue({
      didInstall: true,
      installedSanityVersion: '3.0.0',
    })

    await buildStudio(baseBuildOptions)

    expect(baseBuildOptions.exit).toHaveBeenCalledWith(1)
    expect(mockedBuildStaticFiles).not.toHaveBeenCalled()
  })

  it('should throw error when auto-updates enabled but coercedSanityVersion is invalid', async () => {
    mockedCheckRequiredDependencies.mockResolvedValue({
      didInstall: false,
      installedSanityVersion: 'invalid-version',
    })
    mockedShouldAutoUpdate.mockReturnValue(true)

    const options = {
      ...baseBuildOptions,
      autoUpdatesEnabled: true,
    }

    await expect(buildStudio(options)).rejects.toThrow(
      'Failed to parse installed Sanity version: invalid-version',
    )
  })

  it('should handle auto-updates enabled with valid version', async () => {
    mockedShouldAutoUpdate.mockReturnValue(true)

    const options = {
      ...baseBuildOptions,
      autoUpdatesEnabled: true,
    }

    await buildStudio(options)

    expect(mockOutput.log).toHaveBeenCalledWith(
      `${logSymbols.info} Building with auto-updates enabled`,
    )
    expect(mockedCompareDependencyVersions).toHaveBeenCalled()
    expect(mockedGetStudioAutoUpdateImportMap).toHaveBeenCalledWith(encodeURIComponent('^3.0.0'))
  })

  it('should prompt user when version differences exist and not in unattended mode', async () => {
    const versionDifferences = [
      {
        installed: '3.0.0',
        pkg: 'sanity',
        remote: '3.1.0',
      },
    ]

    mockedShouldAutoUpdate.mockReturnValue(true)
    mockedCompareDependencyVersions.mockResolvedValue(versionDifferences)
    mockedSelect.mockResolvedValue('upgrade-and-proceed')

    const options = {
      ...baseBuildOptions,
      autoUpdatesEnabled: true,
      flags: {...baseBuildOptions.flags, yes: false},
    }

    await buildStudio(options)

    expect(mockedSelect).toHaveBeenCalledWith({
      choices: [
        {
          name: `Upgrade and proceed with build`,
          value: 'upgrade-and-proceed',
        },
        {
          name: `Upgrade only. You will need to run the build command again`,
          value: 'upgrade',
        },
        {name: 'Cancel', value: 'cancel'},
      ],
      default: 'upgrade-and-proceed',
      message: expect.stringContaining('different from the versions currently served'),
    })
  })

  it('should exit when user selects cancel for version differences', async () => {
    const versionDifferences = [
      {
        installed: '3.0.0',
        pkg: 'sanity',
        remote: '3.1.0',
      },
    ]

    mockedShouldAutoUpdate.mockReturnValue(true)
    mockedCompareDependencyVersions.mockResolvedValue(versionDifferences)
    mockedSelect.mockResolvedValue('cancel')

    const options = {
      ...baseBuildOptions,
      autoUpdatesEnabled: true,
      flags: {...baseBuildOptions.flags, yes: false},
    }

    await buildStudio(options)

    expect(baseBuildOptions.exit).toHaveBeenCalledWith(1)
    expect(mockedUpgradePackages).not.toHaveBeenCalled()
  })

  it('should upgrade packages and exit when user selects upgrade only', async () => {
    const versionDifferences = [
      {
        installed: '3.0.0',
        pkg: 'sanity',
        remote: '3.1.0',
      },
    ]

    mockedShouldAutoUpdate.mockReturnValue(true)
    mockedCompareDependencyVersions.mockResolvedValue(versionDifferences)
    mockedSelect.mockResolvedValue('upgrade')

    const options = {
      ...baseBuildOptions,
      autoUpdatesEnabled: true,
      flags: {...baseBuildOptions.flags, yes: false},
    }

    await buildStudio(options)

    expect(mockedUpgradePackages).toHaveBeenCalledWith(
      {
        packageManager: 'npm',
        packages: [['sanity', '3.1.0']],
      },
      {output: mockOutput, workDir: '/test/work/dir'},
    )
    expect(baseBuildOptions.exit).toHaveBeenCalledWith(1)
  })

  it('should upgrade packages and continue building when user selects upgrade-and-proceed', async () => {
    const versionDifferences = [
      {
        installed: '3.0.0',
        pkg: 'sanity',
        remote: '3.1.0',
      },
    ]

    mockedShouldAutoUpdate.mockReturnValue(true)
    mockedCompareDependencyVersions.mockResolvedValue(versionDifferences)
    mockedSelect.mockResolvedValue('upgrade-and-proceed')

    const options = {
      ...baseBuildOptions,
      autoUpdatesEnabled: true,
      flags: {...baseBuildOptions.flags, yes: false},
    }

    await buildStudio(options)

    expect(mockedUpgradePackages).toHaveBeenCalled()
    expect(mockedBuildStaticFiles).toHaveBeenCalled()
  })

  it('should skip version confirmation in unattended mode', async () => {
    const versionDifferences = [
      {
        installed: '3.0.0',
        pkg: 'sanity',
        remote: '3.1.0',
      },
    ]

    mockedShouldAutoUpdate.mockReturnValue(true)
    mockedCompareDependencyVersions.mockResolvedValue(versionDifferences)

    const options = {
      ...baseBuildOptions,
      autoUpdatesEnabled: true,
      flags: {...baseBuildOptions.flags, yes: true},
    }

    await buildStudio(options)

    expect(mockedSelect).not.toHaveBeenCalled()
  })

  it('should log environment variables when present', async () => {
    mockedGetStudioEnvVars.mockReturnValue(['NODE_ENV', 'SANITY_STUDIO_API_URL'])

    await buildStudio(baseBuildOptions)

    expect(mockOutput.log).toHaveBeenCalledWith(
      '\nIncluding the following environment variables as part of the JavaScript bundle:',
    )
    expect(mockOutput.log).toHaveBeenCalledWith('- NODE_ENV')
    expect(mockOutput.log).toHaveBeenCalledWith('- SANITY_STUDIO_API_URL')
    expect(mockOutput.log).toHaveBeenCalledWith('')
  })

  it('should prompt for directory cleanup when using custom output directory in interactive mode', async () => {
    mockedConfirm.mockResolvedValue(true)

    const options = {
      ...baseBuildOptions,
      flags: {...baseBuildOptions.flags, yes: false},
      outDir: '/custom/output/dir',
    }

    await buildStudio(options)

    expect(mockedConfirm).toHaveBeenCalledWith({
      default: true,
      message: expect.stringContaining('Do you want to delete the existing directory'),
    })
  })

  it('should skip cleanup when user declines directory cleanup', async () => {
    mockedConfirm.mockResolvedValue(false)

    const options = {
      ...baseBuildOptions,
      flags: {...baseBuildOptions.flags, yes: false},
      outDir: '/custom/output/dir',
    }

    await buildStudio(options)

    expect(mockedRm).not.toHaveBeenCalled()
  })

  it('should skip cleanup prompt in unattended mode with custom output directory', async () => {
    const options = {
      ...baseBuildOptions,
      flags: {...baseBuildOptions.flags, yes: true},
      outDir: '/custom/output/dir',
    }

    await buildStudio(options)

    expect(mockedConfirm).not.toHaveBeenCalled()
    expect(mockedRm).toHaveBeenCalled()
  })

  it('should handle CLI config with react compiler', async () => {
    const reactCompilerConfig = {
      compilationMode: 'all' as const,
      target: '19' as const,
    }

    const options = {
      ...baseBuildOptions,
      cliConfig: {
        reactCompiler: reactCompilerConfig,
      },
    }

    await buildStudio(options)

    expect(mockedBuildStaticFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        reactCompiler: reactCompilerConfig,
      }),
    )
  })

  it('should handle CLI config with vite config', async () => {
    const viteConfig = {base: '/custom/'}
    const options = {
      ...baseBuildOptions,
      cliConfig: {
        vite: viteConfig,
      },
    }

    await buildStudio(options)

    expect(mockedBuildStaticFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        vite: viteConfig,
      }),
    )
  })

  it('should show stats when stats flag is enabled', async () => {
    const mockBundle = {
      chunks: [
        {
          modules: [{name: 'test', renderedLength: 1000}],
        },
      ],
    }

    mockedBuildStaticFiles.mockResolvedValue(mockBundle)

    const options = {
      ...baseBuildOptions,
      flags: {...baseBuildOptions.flags, stats: true},
    }

    await buildStudio(options)

    expect(mockOutput.log).toHaveBeenCalledWith('\nLargest module files:')
    expect(mockOutput.log).toHaveBeenCalledWith(' - test (1 kB)')
  })

  it('should handle build errors gracefully', async () => {
    const buildError = new Error('Build failed')
    mockedBuildStaticFiles.mockRejectedValue(buildError)

    await buildStudio(baseBuildOptions)
    expect(mockOutput.error).toHaveBeenCalledWith('Failed to build Sanity Studio', {exit: 1})
  })

  it('should handle minify flag', async () => {
    const options = {
      ...baseBuildOptions,
      flags: {...baseBuildOptions.flags, minify: true},
    }

    await buildStudio(options)

    expect(mockedBuildStaticFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        minify: true,
      }),
    )
  })

  it('should handle source-maps flag', async () => {
    const options = {
      ...baseBuildOptions,
      flags: {...baseBuildOptions.flags, 'source-maps': true},
    }

    await buildStudio(options)

    expect(mockedBuildStaticFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceMap: true,
      }),
    )
  })

  it('should pass basePath from determineBasePath to buildStaticFiles', async () => {
    mockedDetermineBasePath.mockReturnValue('/custom-base-path')

    await buildStudio(baseBuildOptions)

    expect(mockedDetermineBasePath).toHaveBeenCalledWith({}, 'studio')
    expect(mockedBuildStaticFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        basePath: '/custom-base-path',
      }),
    )
  })

  it('should build vendor dependencies when auto-updates enabled', async () => {
    mockedShouldAutoUpdate.mockReturnValue(true)
    mockedGetStudioAutoUpdateImportMap.mockReturnValue({test: 'import'})
    mockedBuildVendorDependencies.mockResolvedValue({'vendor-dep': 'path'})

    const options = {
      ...baseBuildOptions,
      autoUpdatesEnabled: true,
    }

    await buildStudio(options)

    expect(mockedBuildVendorDependencies).toHaveBeenCalledWith({
      basePath: '/studio',
      cwd: '/test/work/dir',
      outputDir: path.resolve('/test/work/dir/dist'),
    })

    expect(mockedBuildStaticFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        importMap: {
          imports: {
            test: 'import',
            'vendor-dep': 'path',
          },
        },
      }),
    )
  })

  it('should not build vendor dependencies when auto-updates disabled', async () => {
    mockedShouldAutoUpdate.mockReturnValue(false)

    await buildStudio(baseBuildOptions)

    expect(mockedBuildVendorDependencies).not.toHaveBeenCalled()
    expect(mockedBuildStaticFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        importMap: undefined,
      }),
    )
  })

  it('should use default output directory when outDir is not provided', async () => {
    await buildStudio(baseBuildOptions)

    expect(mockedBuildStaticFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        outputDir: path.resolve('/test/work/dir/dist'),
      }),
    )
  })

  it('should use custom output directory when outDir is provided', async () => {
    const options = {
      ...baseBuildOptions,
      outDir: '/custom/output',
    }

    await buildStudio(options)

    expect(mockedBuildStaticFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        outputDir: path.resolve('/custom/output'),
      }),
    )
  })
})
