import {resolve} from 'node:path'
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

  test('returns null when moduleResolve throws', async () => {
    mockedModuleResolve.mockImplementationOnce(() => {
      throw new Error('Module not found')
    })

    const result = await getLocalPackageVersion(mockModuleId, mockWorkDir)

    expect(mockedModuleResolve).toHaveBeenCalledOnce()
    expect(mockedModuleResolve).toHaveBeenCalledWith(
      `${mockModuleId}/package.json`,
      pathToFileURL(resolve(mockWorkDir, 'noop.js')),
    )
    expect(mockReadPackageJson).not.toHaveBeenCalled()
    expect(result).toBeNull()
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
})
