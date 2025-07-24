import {type Output} from '@sanity/cli-core'
import {execa} from 'execa'
import {beforeEach, describe, expect, test, vi} from 'vitest'

// Imported mocks
import {determineIsApp} from '../../../util/determineIsApp'
import {installNewPackages} from '../../../util/packageManager/installPackages'
import {getPackageManagerChoice} from '../../../util/packageManager/packageManagerChoice'
import {readModuleVersion} from '../../../util/readModuleVersion'
import {readPackageManifest} from '../../../util/readPackageManifest'
import {checkRequiredDependencies} from '../checkRequiredDependencies'

// Mocks
vi.mock('execa')
vi.mock('../../../util/determineIsApp')
vi.mock('../../../util/readModuleVersion')
vi.mock('../../../util/readPackageManifest')
vi.mock('../../../util/packageManager/installPackages')
vi.mock('../../../util/packageManager/packageManagerChoice')
vi.mock(import('@sanity/cli-core'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    isInteractive: true,
  }
})

const mockedExeca = vi.mocked(execa)
const mockedDetermineIsApp = vi.mocked(determineIsApp)
const mockedReadModuleVersion = vi.mocked(readModuleVersion)
const mockedReadPackageManifest = vi.mocked(readPackageManifest)
const mockedInstallNewPackages = vi.mocked(installNewPackages)
const mockedGetPackageManagerChoice = vi.mocked(getPackageManagerChoice)

describe('#checkRequiredDependencies', () => {
  const workDir = '/tmp/test-studio'
  const mockOutput = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }
  const mockCliConfig = {} as never

  beforeEach(() => {
    vi.resetAllMocks()
    process.argv = ['/path/to/node', '/path/to/sanity', 'dev']
  })

  test('should return early if the project is an app', async () => {
    mockedDetermineIsApp.mockReturnValue(true)
    const result = await checkRequiredDependencies({
      cliConfig: mockCliConfig,
      output: mockOutput as unknown as Output,
      workDir,
    })
    expect(result).toEqual({didInstall: false, installedSanityVersion: ''})
    expect(mockedReadPackageManifest).not.toHaveBeenCalled()
  })

  test('should throw an error if sanity is not installed', async () => {
    mockedDetermineIsApp.mockReturnValue(false)
    mockedReadPackageManifest.mockResolvedValue({
      dependencies: {},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockedReadModuleVersion.mockImplementation(async (dir: string, module: string) => {
      if (module === 'sanity') {
        return null
      }
      return '6.1.15'
    })

    await expect(
      checkRequiredDependencies({
        cliConfig: mockCliConfig,
        output: mockOutput as unknown as Output,
        workDir,
      }),
    ).rejects.toThrow('Failed to read the installed sanity version.')
  })

  describe('when styled-components is not declared', () => {
    beforeEach(() => {
      mockedDetermineIsApp.mockReturnValue(false)
      mockedReadPackageManifest.mockResolvedValue({
        dependencies: {},
        devDependencies: {},
        name: 'test-studio',
        version: '1.0.0',
      })
      mockedReadModuleVersion.mockImplementation(async (dir: string, module: string) => {
        if (module === 'sanity') {
          return '3.0.0'
        }
        return null // styled-components not installed
      })
      mockedGetPackageManagerChoice.mockResolvedValue({chosen: 'pnpm', mostOptimal: 'pnpm'})
    })

    test('should install styled-components and re-run command', async () => {
      const result = await checkRequiredDependencies({
        cliConfig: mockCliConfig,
        output: mockOutput as unknown as Output,
        workDir,
      })

      expect(mockedGetPackageManagerChoice).toHaveBeenCalledWith(workDir, {interactive: true})
      expect(mockedInstallNewPackages).toHaveBeenCalledWith(
        {
          packageManager: 'pnpm',
          packages: ['styled-components@^6.1.15'],
        },
        {output: mockOutput as unknown as Output, workDir},
      )
      expect(mockedExeca).toHaveBeenCalledWith('/path/to/node', ['/path/to/sanity', 'dev'], {
        cwd: workDir,
        stdio: 'inherit',
      })
      expect(result).toEqual({didInstall: true, installedSanityVersion: '3.0.0'})
    })
  })

  test('should throw an error for invalid styled-components version range', async () => {
    mockedDetermineIsApp.mockReturnValue(false)
    mockedReadPackageManifest.mockResolvedValue({
      dependencies: {'styled-components': 'some-invalid-range'},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockedReadModuleVersion.mockResolvedValue('3.0.0') // for sanity

    await expect(
      checkRequiredDependencies({
        cliConfig: mockCliConfig,
        output: mockOutput as unknown as Output,
        workDir,
      }),
    ).rejects.toThrow(
      /Declared dependency `styled-components` has an invalid version range: `some-invalid-range`/,
    )
  })

  test('should warn on incompatible declared styled-components version', async () => {
    mockedDetermineIsApp.mockReturnValue(false)
    mockedReadPackageManifest.mockResolvedValue({
      dependencies: {'styled-components': '^5.0.0'},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockedReadModuleVersion.mockImplementation(async (_dir: string, _module: string) => {
      return '6.1.15' // both sanity and styled-components installed
    })

    await checkRequiredDependencies({
      cliConfig: mockCliConfig,
      output: mockOutput as unknown as Output,
      workDir,
    })

    expect(mockOutput.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Declared version of styled-components (^5.0.0) is not compatible with the version required by sanity (^6.1.15)',
      ),
    )
  })

  test('should not warn on complex but valid styled-components version range', async () => {
    mockedDetermineIsApp.mockReturnValue(false)
    mockedReadPackageManifest.mockResolvedValue({
      dependencies: {'styled-components': '>=6.0.0 <7.0.0'},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockedReadModuleVersion.mockResolvedValue('6.1.15')

    await checkRequiredDependencies({
      cliConfig: mockCliConfig,
      output: mockOutput as unknown as Output,
      workDir,
    })

    expect(mockOutput.warn).not.toHaveBeenCalled()
  })

  test('should throw an error if styled-components is declared but not installed', async () => {
    mockedDetermineIsApp.mockReturnValue(false)
    mockedReadPackageManifest.mockResolvedValue({
      dependencies: {'styled-components': '^6.1.15'},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockedReadModuleVersion.mockImplementation(async (dir: string, module: string) => {
      if (module === 'styled-components') {
        return null
      }
      return '3.0.0' // sanity version
    })

    await expect(
      checkRequiredDependencies({
        cliConfig: mockCliConfig,
        output: mockOutput as unknown as Output,
        workDir,
      }),
    ).rejects.toThrow(/Declared dependency `styled-components` is not installed/)
  })

  test('should warn on incompatible installed styled-components version', async () => {
    mockedDetermineIsApp.mockReturnValue(false)
    mockedReadPackageManifest.mockResolvedValue({
      dependencies: {'styled-components': '^6.1.15'},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockedReadModuleVersion.mockImplementation(async (dir: string, module: string) => {
      if (module === 'styled-components') {
        return '5.3.6'
      }
      return '3.0.0' // sanity version
    })

    await checkRequiredDependencies({
      cliConfig: mockCliConfig,
      output: mockOutput as unknown as Output,
      workDir,
    })

    expect(mockOutput.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Installed version of styled-components (5.3.6) is not compatible with the version required by sanity (^6.1.15)',
      ),
    )
  })

  test('should succeed on happy path', async () => {
    mockedDetermineIsApp.mockReturnValue(false)
    mockedReadPackageManifest.mockResolvedValue({
      dependencies: {'styled-components': '^6.1.15'},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })

    mockedReadModuleVersion.mockImplementation(async (workDir: string, name: string) => {
      if (name === 'sanity') return '3.2.0'
      if (name === 'styled-components') return '6.1.15'
      return null
    })

    const result = await checkRequiredDependencies({
      cliConfig: mockCliConfig,
      output: mockOutput as unknown as Output,
      workDir,
    })

    expect(result).toEqual({didInstall: false, installedSanityVersion: '3.2.0'})
    expect(mockOutput.warn).not.toHaveBeenCalled()
    expect(mockedInstallNewPackages).not.toHaveBeenCalled()
    expect(mockedExeca).not.toHaveBeenCalled()
  })

  test('should warn if a different package manager is chosen than the optimal one', async () => {
    mockedDetermineIsApp.mockReturnValue(false)
    mockedReadPackageManifest.mockResolvedValue({
      dependencies: {},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockedReadModuleVersion.mockImplementation(async (dir: string, module: string) => {
      if (module === 'sanity') {
        return '3.0.0'
      }
      return null
    })
    mockedGetPackageManagerChoice.mockResolvedValue({chosen: 'npm', mostOptimal: 'pnpm'})

    await checkRequiredDependencies({
      cliConfig: mockCliConfig,
      output: mockOutput as unknown as Output,
      workDir,
    })

    expect(mockOutput.warn).toHaveBeenCalledWith(
      'WARN: This project appears to be installed with or using pnpm - using a different package manager _may_ result in errors.',
    )
  })
})
