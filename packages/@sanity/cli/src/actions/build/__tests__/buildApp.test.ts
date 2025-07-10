import {rm} from 'node:fs/promises'

import {afterEach, beforeEach, describe, expect, it, type MockedFunction, vi} from 'vitest'

import {info} from '../../../core/logSymbols.js'
import {type Output} from '../../../types.js'
import {buildApp} from '../buildApp.js'
import {type BuildOptions} from '../types.js'

vi.mock('node:fs/promises')
vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}))

vi.mock('../../../core/spinner.js', () => ({
  spinner: vi.fn(() => ({
    fail: vi.fn().mockReturnThis(),
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    text: '',
  })),
}))
vi.mock('../../../util/compareDependencyVersions.js')
vi.mock('../../../util/readModuleVersion.js')
vi.mock('../buildStaticFiles.js')
vi.mock('../buildVendorDependencies.js')
vi.mock('../getAppEnvVars.js')
vi.mock('../getAutoUpdatesImportMap.js')

const mockedRm = rm as MockedFunction<typeof rm>
const mockedConfirm = vi.hoisted(() => vi.fn())
const mockedCompareDependencyVersions = vi.hoisted(() => vi.fn())
const mockedReadModuleVersion = vi.hoisted(() => vi.fn())
const mockedBuildStaticFiles = vi.hoisted(() => vi.fn())
const mockedBuildVendorDependencies = vi.hoisted(() => vi.fn())
const mockedGetAppEnvVars = vi.hoisted(() => vi.fn())
const mockedGetAppAutoUpdateImportMap = vi.hoisted(() => vi.fn())

vi.mock('@inquirer/prompts', () => ({
  confirm: mockedConfirm,
}))

vi.mock('../../../util/compareDependencyVersions.js', () => ({
  compareDependencyVersions: mockedCompareDependencyVersions,
}))

vi.mock('../../../util/readModuleVersion.js', () => ({
  readModuleVersion: mockedReadModuleVersion,
}))

vi.mock('../buildStaticFiles.js', () => ({
  buildStaticFiles: mockedBuildStaticFiles,
}))

vi.mock('../buildVendorDependencies.js', () => ({
  buildVendorDependencies: mockedBuildVendorDependencies,
}))

vi.mock('../getAppEnvVars.js', () => ({
  getAppEnvVars: mockedGetAppEnvVars,
}))

vi.mock('../getAutoUpdatesImportMap.js', () => ({
  getAppAutoUpdateImportMap: mockedGetAppAutoUpdateImportMap,
}))

describe('buildApp', () => {
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
    mockedReadModuleVersion.mockResolvedValue('1.0.0')
    mockedGetAppEnvVars.mockReturnValue([])
    mockedGetAppAutoUpdateImportMap.mockReturnValue({})
    mockedBuildStaticFiles.mockResolvedValue({
      chunks: [],
    })
    mockedBuildVendorDependencies.mockResolvedValue({})
    mockedCompareDependencyVersions.mockResolvedValue([])
    mockedRm.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should build app successfully with basic options', async () => {
    await buildApp(baseBuildOptions)

    expect(mockedReadModuleVersion).toHaveBeenCalledWith('/test/work/dir/dist', '@sanity/sdk-react')
    expect(mockedBuildStaticFiles).toHaveBeenCalled()
  })

  it('should throw error when installedSdkVersion is not found', async () => {
    mockedReadModuleVersion.mockResolvedValueOnce(undefined)

    await expect(buildApp(baseBuildOptions)).rejects.toThrow(
      'Failed to find installed @sanity/sdk-react version',
    )
  })

  it('should throw error when auto-updates enabled but coercedSdkVersion is invalid', async () => {
    // Mock an invalid version that semver.coerce returns null for
    mockedReadModuleVersion.mockResolvedValueOnce('invalid-version')

    const options = {
      ...baseBuildOptions,
      autoUpdatesEnabled: true,
    }

    await expect(buildApp(options)).rejects.toThrow(
      'Failed to parse installed SDK version: invalid-version',
    )
  })

  it('should handle auto-updates enabled with valid version', async () => {
    const options = {
      ...baseBuildOptions,
      autoUpdatesEnabled: true,
    }

    await buildApp(options)

    expect(mockOutput.log).toHaveBeenCalledWith(`${info} Building with auto-updates enabled`)
    expect(mockedCompareDependencyVersions).toHaveBeenCalled()
  })

  it('should prompt user when version differences exist and not in unattended mode', async () => {
    const versionDifferences = [
      {
        installed: '1.0.0',
        pkg: '@sanity/sdk-react',
        remote: '1.1.0',
      },
    ]

    mockedCompareDependencyVersions.mockResolvedValue(versionDifferences)
    mockedConfirm.mockResolvedValue(true)

    const options = {
      ...baseBuildOptions,
      autoUpdatesEnabled: true,
      flags: {...baseBuildOptions.flags, yes: false},
    }

    await buildApp(options)

    expect(mockedConfirm).toHaveBeenCalledWith({
      default: false,
      message: expect.stringContaining('different from the versions currently served'),
    })
  })

  it('should exit when user declines version difference confirmation', async () => {
    const versionDifferences = [
      {
        installed: '1.0.0',
        pkg: '@sanity/sdk-react',
        remote: '1.1.0',
      },
    ]

    mockedCompareDependencyVersions.mockResolvedValue(versionDifferences)
    mockedConfirm.mockResolvedValue(false)

    const options = {
      ...baseBuildOptions,
      autoUpdatesEnabled: true,
      flags: {...baseBuildOptions.flags, yes: false},
    }

    await buildApp(options)
    expect(baseBuildOptions.exit).toHaveBeenCalledWith(1)
  })

  it('should continue build when user confirms version difference prompt', async () => {
    const versionDifferences = [
      {
        installed: '1.0.0',
        pkg: '@sanity/sdk-react',
        remote: '1.1.0',
      },
    ]

    mockedCompareDependencyVersions.mockResolvedValue(versionDifferences)
    mockedConfirm.mockResolvedValue(true)

    const options = {
      ...baseBuildOptions,
      autoUpdatesEnabled: true,
      flags: {...baseBuildOptions.flags, yes: false},
    }

    await buildApp(options)

    expect(mockedConfirm).toHaveBeenCalledWith({
      default: false,
      message: expect.stringContaining('different from the versions currently served'),
    })
    expect(baseBuildOptions.exit).not.toHaveBeenCalled()
    expect(mockedBuildStaticFiles).toHaveBeenCalled()
    expect(mockedBuildVendorDependencies).toHaveBeenCalled()
  })

  it('should skip version confirmation in unattended mode', async () => {
    const versionDifferences = [
      {
        installed: '1.0.0',
        pkg: '@sanity/sdk-react',
        remote: '1.1.0',
      },
    ]

    mockedCompareDependencyVersions.mockResolvedValue(versionDifferences)

    const options = {
      ...baseBuildOptions,
      autoUpdatesEnabled: true,
      flags: {...baseBuildOptions.flags, yes: true},
    }

    await buildApp(options)

    expect(mockedConfirm).not.toHaveBeenCalled()
  })

  it('should log environment variables when present', async () => {
    mockedGetAppEnvVars.mockReturnValue(['NODE_ENV', 'API_URL'])

    await buildApp(baseBuildOptions)

    expect(mockOutput.log).toHaveBeenCalledWith(
      '\nIncluding the following environment variables as part of the JavaScript bundle:',
    )
    expect(mockOutput.log).toHaveBeenCalledWith('- NODE_ENV')
    expect(mockOutput.log).toHaveBeenCalledWith('- API_URL')
    expect(mockOutput.log).toHaveBeenCalledWith('')
  })

  it('should prompt for directory cleanup when using custom output directory in interactive mode', async () => {
    mockedConfirm.mockResolvedValue(true)

    const options = {
      ...baseBuildOptions,
      flags: {...baseBuildOptions.flags, yes: false},
      outDir: '/custom/output/dir',
    }

    await buildApp(options)

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

    await buildApp(options)

    expect(mockedRm).not.toHaveBeenCalled()
  })

  it('should skip cleanup prompt in unattended mode with custom output directory', async () => {
    const options = {
      ...baseBuildOptions,
      flags: {...baseBuildOptions.flags, yes: true},
      outDir: '/custom/output/dir',
    }

    await buildApp(options)

    expect(mockedConfirm).not.toHaveBeenCalled()
    expect(mockedRm).toHaveBeenCalled()
  })

  it('should handle CLI config with app entry', async () => {
    const options = {
      ...baseBuildOptions,
      cliConfig: {
        app: {
          entry: 'custom-entry.ts',
        },
      },
    }

    await buildApp(options)

    expect(mockedBuildStaticFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        entry: 'custom-entry.ts',
      }),
    )
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

    await buildApp(options)

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

    await buildApp(options)

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

    await buildApp(options)

    expect(mockOutput.log).toHaveBeenCalledWith('\nLargest module files:')
    expect(mockOutput.log).toHaveBeenCalledWith(' - test (1 kB)')
  })

  it('should handle build errors gracefully', async () => {
    const buildError = new Error('Build failed')
    mockedBuildStaticFiles.mockRejectedValue(buildError)

    await buildApp(baseBuildOptions)
    expect(mockOutput.error).toHaveBeenCalledWith('Failed to build Sanity application', {exit: 1})
  })

  it('should handle minify flag', async () => {
    const options = {
      ...baseBuildOptions,
      flags: {...baseBuildOptions.flags, minify: true},
    }

    await buildApp(options)

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

    await buildApp(options)

    expect(mockedBuildStaticFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceMap: true,
      }),
    )
  })
})
