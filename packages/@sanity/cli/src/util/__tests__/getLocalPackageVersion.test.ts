import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

import {type PackageJson} from '@sanity/cli-core'
import {moduleResolve} from 'import-meta-resolve'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {getLocalPackageVersion} from '../getLocalPackageVersion.js'

const mockReadPackageJson = vi.hoisted(() => vi.fn())

vi.mock('import-meta-resolve')

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    readPackageJson: mockReadPackageJson,
  }
})

const mockedModuleResolve = vi.mocked(moduleResolve)

function createNodeError(code: string, message: string): Error {
  const err = new Error(message)
  ;(err as Error & {code: string}).code = code
  return err
}

describe('getLocalPackageVersion', () => {
  const mockWorkDir = '/mock/work/dir'
  const mockModuleId = '@sanity/test'

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns version when package.json is resolved', async () => {
    const mockPackageUrl = pathToFileURL(
      resolve(mockWorkDir, 'node_modules', mockModuleId, 'package.json'),
    )
    const mockVersion = '1.0.0'

    mockedModuleResolve.mockReturnValueOnce(mockPackageUrl)
    mockReadPackageJson.mockResolvedValueOnce({
      name: mockModuleId,
      version: mockVersion,
    } as PackageJson)

    const result = await getLocalPackageVersion(mockModuleId, mockWorkDir)

    expect(mockedModuleResolve).toHaveBeenCalledWith(
      `${mockModuleId}/package.json`,
      pathToFileURL(resolve(mockWorkDir, 'noop.js')),
    )
    expect(mockReadPackageJson).toHaveBeenCalledWith(mockPackageUrl)
    expect(result).toBe(mockVersion)
  })

  test('returns null when readPackageJson throws', async () => {
    const mockPackageUrl = pathToFileURL(
      resolve(mockWorkDir, 'node_modules', mockModuleId, 'package.json'),
    )

    mockedModuleResolve.mockReturnValueOnce(mockPackageUrl)
    mockReadPackageJson.mockRejectedValueOnce(new Error('Failed to read package.json'))

    const result = await getLocalPackageVersion(mockModuleId, mockWorkDir)

    expect(mockedModuleResolve).toHaveBeenCalledOnce()
    expect(mockReadPackageJson).toHaveBeenCalledWith(mockPackageUrl)
    expect(result).toBeNull()
  })

  test('returns version via fallback when package has strict exports', async () => {
    const mainEntryPath = resolve(mockWorkDir, 'node_modules', mockModuleId, 'dist', 'index.js')
    const mainEntryUrl = pathToFileURL(mainEntryPath)
    const expectedPackageJsonUrl = pathToFileURL(
      join(resolve(mockWorkDir, 'node_modules', mockModuleId), 'package.json'),
    )
    const mockVersion = '2.0.0'
    const dirUrl = pathToFileURL(resolve(mockWorkDir, 'noop.js'))

    mockedModuleResolve
      .mockImplementationOnce(() => {
        throw createNodeError('ERR_PACKAGE_PATH_NOT_EXPORTED', 'Package path not exported')
      })
      .mockReturnValueOnce(mainEntryUrl)

    mockReadPackageJson.mockResolvedValueOnce({
      name: mockModuleId,
      version: mockVersion,
    } as PackageJson)

    const result = await getLocalPackageVersion(mockModuleId, mockWorkDir)

    expect(mockedModuleResolve).toHaveBeenCalledTimes(2)
    expect(mockedModuleResolve).toHaveBeenNthCalledWith(1, `${mockModuleId}/package.json`, dirUrl)
    expect(mockedModuleResolve).toHaveBeenNthCalledWith(2, mockModuleId, dirUrl)
    expect(mockReadPackageJson).toHaveBeenCalledWith(expectedPackageJsonUrl)
    expect(result).toBe(mockVersion)
  })

  test('returns null when fallback moduleResolve also throws', async () => {
    mockedModuleResolve
      .mockImplementationOnce(() => {
        throw createNodeError('ERR_PACKAGE_PATH_NOT_EXPORTED', 'Package path not exported')
      })
      .mockImplementationOnce(() => {
        throw createNodeError('ERR_MODULE_NOT_FOUND', 'Module not found')
      })

    const result = await getLocalPackageVersion(mockModuleId, mockWorkDir)

    expect(mockedModuleResolve).toHaveBeenCalledTimes(2)
    expect(mockReadPackageJson).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  test('returns null when readPackageJson fails in fallback path', async () => {
    const mainEntryPath = resolve(mockWorkDir, 'node_modules', mockModuleId, 'dist', 'index.js')

    mockedModuleResolve
      .mockImplementationOnce(() => {
        throw createNodeError('ERR_PACKAGE_PATH_NOT_EXPORTED', 'Package path not exported')
      })
      .mockReturnValueOnce(pathToFileURL(mainEntryPath))

    mockReadPackageJson.mockRejectedValueOnce(new Error('Failed to read package.json'))

    const result = await getLocalPackageVersion(mockModuleId, mockWorkDir)

    expect(mockedModuleResolve).toHaveBeenCalledTimes(2)
    expect(mockReadPackageJson).toHaveBeenCalledOnce()
    expect(result).toBeNull()
  })

  test('handles import.meta.url (file:// URL) by extracting the directory', async () => {
    const importMetaUrl = 'file:///mock/work/dir/some-file.ts'
    const expectedDir = '/mock/work/dir'
    const mockPackageUrl = pathToFileURL(
      resolve(expectedDir, 'node_modules', mockModuleId, 'package.json'),
    )
    const mockVersion = '3.0.0'

    mockedModuleResolve.mockReturnValueOnce(mockPackageUrl)
    mockReadPackageJson.mockResolvedValueOnce({
      name: mockModuleId,
      version: mockVersion,
    } as PackageJson)

    const result = await getLocalPackageVersion(mockModuleId, importMetaUrl)

    expect(mockedModuleResolve).toHaveBeenCalledWith(
      `${mockModuleId}/package.json`,
      pathToFileURL(resolve(expectedDir, 'noop.js')),
    )
    expect(result).toBe(mockVersion)
  })

  test('returns null when moduleResolve throws a non-fallback error', async () => {
    mockedModuleResolve.mockImplementationOnce(() => {
      throw createNodeError('ERR_MODULE_NOT_FOUND', 'Module not found')
    })

    const result = await getLocalPackageVersion(mockModuleId, mockWorkDir)

    expect(mockedModuleResolve).toHaveBeenCalledOnce()
    expect(mockReadPackageJson).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })
})
