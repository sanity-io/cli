import {type CliConfig, type Output} from '@sanity/cli-core'
import {beforeEach, describe, expect, test, vi} from 'vitest'

// Imported mocks
import {determineIsApp} from '../../../util/determineIsApp'
import {readModuleVersion} from '../../../util/readModuleVersion'
import {readPackageJson} from '../../../util/readPackageJson'
import {checkRequiredDependencies} from '../checkRequiredDependencies'

// Mocks
vi.mock('../../../util/determineIsApp')
vi.mock('../../../util/readModuleVersion')
vi.mock('../../../util/readPackageJson')

const mockedDetermineIsApp = vi.mocked(determineIsApp)
const mockedReadModuleVersion = vi.mocked(readModuleVersion)
const mockedReadPackageJson = vi.mocked(readPackageJson)

describe('#checkRequiredDependencies', () => {
  const workDir = '/tmp/test-studio'
  const mockOutput = {
    error: vi.fn(),
    log: vi.fn(),
    print: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
  const mockCliConfig: Partial<CliConfig> = {}

  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('should return early if the project is an app', async () => {
    mockedDetermineIsApp.mockReturnValue(true)
    const result = await checkRequiredDependencies({
      cliConfig: mockCliConfig as CliConfig,
      output: mockOutput,
      workDir,
    })
    expect(result).toEqual({installedSanityVersion: ''})
    expect(mockedReadPackageJson).not.toHaveBeenCalled()
  })

  test('should call output.error and return empty string if sanity is not installed', async () => {
    mockedDetermineIsApp.mockReturnValue(false)
    mockedReadPackageJson.mockResolvedValue({
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

    const result = await checkRequiredDependencies({
      cliConfig: mockCliConfig as CliConfig,
      output: mockOutput,
      workDir,
    })

    expect(mockOutput.error).toHaveBeenCalledWith('Failed to read the installed sanity version.', {
      exit: 1,
    })
    expect(result).toEqual({installedSanityVersion: ''})
  })

  test('should call output.error and return sanity version if styled-components is not declared', async () => {
    mockedDetermineIsApp.mockReturnValue(false)
    mockedReadPackageJson.mockResolvedValue({
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

    const result = await checkRequiredDependencies({
      cliConfig: mockCliConfig as CliConfig,
      output: mockOutput,
      workDir,
    })

    expect(mockOutput.error).toHaveBeenCalledWith(
      expect.stringContaining('Declared dependency `styled-components` is not installed'),
      {exit: 1},
    )
    expect(result).toEqual({installedSanityVersion: '3.0.0'})
  })

  test('should call output.error and return sanity version for invalid styled-components version range', async () => {
    mockedDetermineIsApp.mockReturnValue(false)
    mockedReadPackageJson.mockResolvedValue({
      dependencies: {'styled-components': 'some-invalid-range'},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockedReadModuleVersion.mockResolvedValue('3.0.0') // for sanity

    const result = await checkRequiredDependencies({
      cliConfig: mockCliConfig as CliConfig,
      output: mockOutput,
      workDir,
    })

    expect(mockOutput.error).toHaveBeenCalledWith(
      expect.stringContaining(
        'Declared dependency `styled-components` has an invalid version range: `some-invalid-range`',
      ),
      {exit: 1},
    )
    expect(result).toEqual({installedSanityVersion: '3.0.0'})
  })

  test('should warn on incompatible declared styled-components version', async () => {
    mockedDetermineIsApp.mockReturnValue(false)
    mockedReadPackageJson.mockResolvedValue({
      dependencies: {'styled-components': '^5.0.0'},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockedReadModuleVersion.mockImplementation(async (_dir: string, _module: string) => {
      return '6.1.15' // both sanity and styled-components installed
    })

    await checkRequiredDependencies({
      cliConfig: mockCliConfig as CliConfig,
      output: mockOutput,
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
    mockedReadPackageJson.mockResolvedValue({
      dependencies: {'styled-components': '>=6.0.0 <7.0.0'},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockedReadModuleVersion.mockResolvedValue('6.1.15')

    await checkRequiredDependencies({
      cliConfig: mockCliConfig as CliConfig,
      output: mockOutput,
      workDir,
    })

    expect(mockOutput.warn).not.toHaveBeenCalled()
  })

  test('should call output.error and return sanity version if styled-components is declared but not installed', async () => {
    mockedDetermineIsApp.mockReturnValue(false)
    mockedReadPackageJson.mockResolvedValue({
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

    const result = await checkRequiredDependencies({
      cliConfig: mockCliConfig as CliConfig,
      output: mockOutput,
      workDir,
    })

    expect(mockOutput.error).toHaveBeenCalledWith(
      expect.stringContaining('Declared dependency `styled-components` is not installed'),
      {exit: 1},
    )
    expect(result).toEqual({installedSanityVersion: '3.0.0'})
  })

  test('should warn on incompatible installed styled-components version', async () => {
    mockedDetermineIsApp.mockReturnValue(false)
    mockedReadPackageJson.mockResolvedValue({
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
      cliConfig: mockCliConfig as CliConfig,
      output: mockOutput,
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
    mockedReadPackageJson.mockResolvedValue({
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
      cliConfig: mockCliConfig as CliConfig,
      output: mockOutput,
      workDir,
    })

    expect(result).toEqual({installedSanityVersion: '3.2.0'})
    expect(mockOutput.warn).not.toHaveBeenCalled()
  })
})
