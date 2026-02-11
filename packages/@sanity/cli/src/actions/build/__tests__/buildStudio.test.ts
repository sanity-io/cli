import {rm} from 'node:fs/promises'
import path from 'node:path'

import {exit} from '@oclif/core/errors'
import {type Output} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'
import {mockTelemetry} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, it, type MockedFunction, vi} from 'vitest'

import {buildStudio} from '../buildStudio.js'
import {type BuildOptions} from '../types.js'

vi.mock('node:fs/promises')

const mockedRm = rm as MockedFunction<typeof rm>
const mockedConfirm = vi.hoisted(() => vi.fn())
const mockedSelect = vi.hoisted(() => vi.fn())
const mockedGetAppId = vi.hoisted(() => vi.fn())
const mockedCompareDependencyVersions = vi.hoisted(() => vi.fn())
const mockedGetPackageManagerChoice = vi.hoisted(() => vi.fn())
const mockedUpgradePackages = vi.hoisted(() => vi.fn())
const mockedWarnAboutMissingAppId = vi.hoisted(() => vi.fn())
const mockedBuildStaticFiles = vi.hoisted(() => vi.fn())
const mockedBuildVendorDependencies = vi.hoisted(() => vi.fn())
const mockedCheckRequiredDependencies = vi.hoisted(() => vi.fn())
const mockedCheckStudioDependencyVersions = vi.hoisted(() => vi.fn())
const mockedDetermineBasePath = vi.hoisted(() => vi.fn())
const mockedGetAutoUpdatesImportMap = vi.hoisted(() => vi.fn())
const mockedGetStudioEnvVars = vi.hoisted(() => vi.fn())
const mockedShouldAutoUpdate = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/ux', async () => {
  const original = await import('@sanity/cli-core/ux')
  return {
    ...original,
    confirm: mockedConfirm,
    select: mockedSelect,
    spinner: vi.fn(() => ({
      fail: vi.fn().mockReturnThis(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
      text: '',
    })),
  }
})

vi.mock('../../../util/appId.js', () => ({
  getAppId: mockedGetAppId,
}))

vi.mock('../../../util/compareDependencyVersions.js', () => ({
  compareDependencyVersions: mockedCompareDependencyVersions,
}))

vi.mock('../../../util/warnAboutMissingAppId.js', () => ({
  warnAboutMissingAppId: mockedWarnAboutMissingAppId,
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
  getAutoUpdatesImportMap: mockedGetAutoUpdatesImportMap,
}))

vi.mock('../getStudioEnvVars.js', () => ({
  getStudioEnvVars: mockedGetStudioEnvVars,
}))

vi.mock('../shouldAutoUpdate.js', () => ({
  shouldAutoUpdate: mockedShouldAutoUpdate,
}))

vi.mock('@oclif/core/errors', () => ({
  exit: vi.fn(),
}))

describe('buildStudio', () => {
  const mockOutput = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output

  mockTelemetry()

  const baseBuildOptions: BuildOptions = {
    autoUpdatesEnabled: false,
    cliConfig: {},
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
    mockedGetAppId.mockReturnValue(undefined)
    mockedWarnAboutMissingAppId.mockReturnValue(undefined)
    mockedCheckStudioDependencyVersions.mockResolvedValue(undefined)
    mockedCheckRequiredDependencies.mockResolvedValue({
      installedSanityVersion: '3.0.0',
    })
    mockedShouldAutoUpdate.mockReturnValue(false)
    mockedGetAutoUpdatesImportMap.mockReturnValue({})
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
    vi.clearAllMocks()
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

  it('should throw error when auto-updates enabled but cleanSanityVersion is invalid', async () => {
    mockedCheckRequiredDependencies.mockResolvedValue({
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

  it('should warn when auto updates are enabled but an appId has not been configured', async () => {
    mockedShouldAutoUpdate.mockReturnValue(true)

    const options = {
      ...baseBuildOptions,
      autoUpdatesEnabled: true,
      cliConfig: {
        api: {
          projectId: 'test-project',
        },
      },
    }

    await buildStudio(options)

    expect(mockedWarnAboutMissingAppId).toHaveBeenCalledWith({
      appType: 'studio',
      output: mockOutput,
      projectId: 'test-project',
    })
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

    const expectedPackages = [
      {name: 'sanity', version: '3.0.0'},
      {name: '@sanity/vision', version: '3.0.0'},
    ]

    expect(mockedGetAutoUpdatesImportMap).toHaveBeenCalledWith(expectedPackages, {appId: undefined})
    expect(mockedCompareDependencyVersions).toHaveBeenCalledWith(expectedPackages, '/test/work/dir')
  })

  it('should pass appId to getAutoUpdatesImportMap when configured', async () => {
    mockedShouldAutoUpdate.mockReturnValue(true)
    mockedGetAppId.mockReturnValue('test-app-id')

    const options = {
      ...baseBuildOptions,
      autoUpdatesEnabled: true,
      cliConfig: {
        deployment: {
          appId: 'test-app-id',
        },
      },
    }

    await buildStudio(options)

    const expectedPackages = [
      {name: 'sanity', version: '3.0.0'},
      {name: '@sanity/vision', version: '3.0.0'},
    ]

    expect(mockedGetAutoUpdatesImportMap).toHaveBeenCalledWith(expectedPackages, {
      appId: 'test-app-id',
    })
    expect(mockedCompareDependencyVersions).toHaveBeenCalledWith(expectedPackages, '/test/work/dir')
    // Should not warn about missing appId when appId is configured
    expect(mockedWarnAboutMissingAppId).not.toHaveBeenCalled()
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

    expect(exit).toHaveBeenCalledWith(1)
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
    expect(exit).toHaveBeenCalledWith(1)
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
    expect(mockOutput.error).toHaveBeenCalledWith('Failed to build Sanity Studio: Build failed', {
      exit: 1,
    })
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
    mockedGetAutoUpdatesImportMap.mockReturnValue({test: 'import'})
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
