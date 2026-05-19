import {dirname, join, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {type PackageJson} from '../readPackageJson.js'

const mockReadPackageJson = vi.hoisted(() => vi.fn())
const mockResolveModuleUrl = vi.hoisted(() => vi.fn())

vi.mock('../resolveModuleUrl.js', () => ({
  resolveModuleUrl: mockResolveModuleUrl,
}))

vi.mock('../readPackageJson.js', () => ({
  readPackageJson: mockReadPackageJson,
}))

const {getLocalPackageDir, getLocalPackageVersion} = await import('../getLocalPackageVersion.js')

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
    const expectedPackageDir = resolve(mockWorkDir, 'node_modules', mockModuleId)
    const mockVersion = '1.0.0'

    mockResolveModuleUrl.mockReturnValueOnce(mockPackageUrl)
    mockReadPackageJson.mockResolvedValueOnce({
      name: mockModuleId,
      version: mockVersion,
    } as PackageJson)

    const result = await getLocalPackageVersion(mockModuleId, mockWorkDir)

    expect(mockResolveModuleUrl).toHaveBeenCalledWith(
      `${mockModuleId}/package.json`,
      pathToFileURL(resolve(mockWorkDir, 'noop.js')),
    )
    expect(mockReadPackageJson).toHaveBeenCalledWith(join(expectedPackageDir, 'package.json'))
    expect(result).toBe(mockVersion)
  })

  test('returns null when readPackageJson throws', async () => {
    const mockPackageUrl = pathToFileURL(
      resolve(mockWorkDir, 'node_modules', mockModuleId, 'package.json'),
    )
    const expectedPackageDir = resolve(mockWorkDir, 'node_modules', mockModuleId)

    mockResolveModuleUrl.mockReturnValueOnce(mockPackageUrl)
    mockReadPackageJson.mockRejectedValueOnce(new Error('Failed to read package.json'))

    const result = await getLocalPackageVersion(mockModuleId, mockWorkDir)

    expect(mockResolveModuleUrl).toHaveBeenCalledOnce()
    expect(mockReadPackageJson).toHaveBeenCalledWith(join(expectedPackageDir, 'package.json'))
    expect(result).toBeNull()
  })

  test('returns version via fallback when package has strict exports', async () => {
    const mainEntryPath = resolve(mockWorkDir, 'node_modules', mockModuleId, 'dist', 'index.js')
    const mainEntryUrl = pathToFileURL(mainEntryPath)
    const expectedPackageDir = resolve(mockWorkDir, 'node_modules', mockModuleId)
    const mockVersion = '2.0.0'
    const dirUrl = pathToFileURL(resolve(mockWorkDir, 'noop.js'))

    mockResolveModuleUrl
      .mockImplementationOnce(() => {
        throw createNodeError('ERR_PACKAGE_PATH_NOT_EXPORTED', 'Package path not exported')
      })
      .mockReturnValueOnce(mainEntryUrl)

    mockReadPackageJson.mockResolvedValueOnce({
      name: mockModuleId,
      version: mockVersion,
    } as PackageJson)

    const result = await getLocalPackageVersion(mockModuleId, mockWorkDir)

    expect(mockResolveModuleUrl).toHaveBeenCalledTimes(2)
    expect(mockResolveModuleUrl).toHaveBeenNthCalledWith(1, `${mockModuleId}/package.json`, dirUrl)
    expect(mockResolveModuleUrl).toHaveBeenNthCalledWith(2, mockModuleId, dirUrl)
    expect(mockReadPackageJson).toHaveBeenCalledWith(join(expectedPackageDir, 'package.json'))
    expect(result).toBe(mockVersion)
  })

  test('returns null when fallback resolveModuleUrl also throws', async () => {
    mockResolveModuleUrl
      .mockImplementationOnce(() => {
        throw createNodeError('ERR_PACKAGE_PATH_NOT_EXPORTED', 'Package path not exported')
      })
      .mockImplementationOnce(() => {
        throw createNodeError('ERR_MODULE_NOT_FOUND', 'Module not found')
      })

    const result = await getLocalPackageVersion(mockModuleId, mockWorkDir)

    expect(mockResolveModuleUrl).toHaveBeenCalledTimes(2)
    expect(mockReadPackageJson).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  test('returns null when readPackageJson fails in fallback path', async () => {
    const mainEntryPath = resolve(mockWorkDir, 'node_modules', mockModuleId, 'dist', 'index.js')

    mockResolveModuleUrl
      .mockImplementationOnce(() => {
        throw createNodeError('ERR_PACKAGE_PATH_NOT_EXPORTED', 'Package path not exported')
      })
      .mockReturnValueOnce(pathToFileURL(mainEntryPath))

    mockReadPackageJson.mockRejectedValueOnce(new Error('Failed to read package.json'))

    const result = await getLocalPackageVersion(mockModuleId, mockWorkDir)

    expect(mockResolveModuleUrl).toHaveBeenCalledTimes(2)
    expect(mockReadPackageJson).toHaveBeenCalledOnce()
    expect(result).toBeNull()
  })

  test('handles import.meta.url (file:// URL) by extracting the directory', async () => {
    // Use a real absolute path so the test works on both Unix and Windows
    const fakeSrcFile = resolve(mockWorkDir, 'some-file.ts')
    const importMetaUrl = pathToFileURL(fakeSrcFile).href
    // The function should dirname the file URL to get the containing directory
    const expectedDir = dirname(fileURLToPath(importMetaUrl))
    const mockPackageUrl = pathToFileURL(
      resolve(expectedDir, 'node_modules', mockModuleId, 'package.json'),
    )
    const mockVersion = '3.0.0'

    mockResolveModuleUrl.mockReturnValueOnce(mockPackageUrl)
    mockReadPackageJson.mockResolvedValueOnce({
      name: mockModuleId,
      version: mockVersion,
    } as PackageJson)

    const result = await getLocalPackageVersion(mockModuleId, importMetaUrl)

    expect(mockResolveModuleUrl).toHaveBeenCalledWith(
      `${mockModuleId}/package.json`,
      pathToFileURL(resolve(expectedDir, 'noop.js')),
    )
    expect(result).toBe(mockVersion)
  })

  test('returns null when resolveModuleUrl throws a non-fallback error', async () => {
    mockResolveModuleUrl.mockImplementationOnce(() => {
      throw createNodeError('ERR_MODULE_NOT_FOUND', 'Module not found')
    })

    const result = await getLocalPackageVersion(mockModuleId, mockWorkDir)

    expect(mockResolveModuleUrl).toHaveBeenCalledOnce()
    expect(mockReadPackageJson).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })
})

describe('getLocalPackageDir', () => {
  const mockWorkDir = '/mock/work/dir'
  const mockModuleId = '@sanity/test'

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns package directory when package.json is resolved', () => {
    const mockPackageUrl = pathToFileURL(
      resolve(mockWorkDir, 'node_modules', mockModuleId, 'package.json'),
    )

    mockResolveModuleUrl.mockReturnValueOnce(mockPackageUrl)

    const result = getLocalPackageDir(mockModuleId, mockWorkDir)

    expect(result).toBe(resolve(mockWorkDir, 'node_modules', mockModuleId))
    expect(mockResolveModuleUrl).toHaveBeenCalledWith(
      `${mockModuleId}/package.json`,
      pathToFileURL(resolve(mockWorkDir, 'noop.js')),
    )
  })

  test('resolves hoisted packages in monorepo root node_modules', () => {
    // Simulate a monorepo where react is hoisted to root
    const monorepoRoot = '/project'
    const workspaceDir = '/project/packages/frontend'
    const hoistedPackageUrl = pathToFileURL(
      resolve(monorepoRoot, 'node_modules', 'react', 'package.json'),
    )

    mockResolveModuleUrl.mockReturnValueOnce(hoistedPackageUrl)

    const result = getLocalPackageDir('react', workspaceDir)

    expect(result).toBe(resolve(monorepoRoot, 'node_modules', 'react'))
  })

  test('falls back to main entry point when package.json is not exported', () => {
    const mainEntryPath = resolve(mockWorkDir, 'node_modules', mockModuleId, 'dist', 'index.js')
    const mainEntryUrl = pathToFileURL(mainEntryPath)

    mockResolveModuleUrl
      .mockImplementationOnce(() => {
        throw createNodeError('ERR_PACKAGE_PATH_NOT_EXPORTED', 'Package path not exported')
      })
      .mockReturnValueOnce(mainEntryUrl)

    const result = getLocalPackageDir(mockModuleId, mockWorkDir)

    expect(result).toBe(resolve(mockWorkDir, 'node_modules', mockModuleId))
    expect(mockResolveModuleUrl).toHaveBeenCalledTimes(2)
  })

  test('throws when resolveModuleUrl throws a non-fallback error', () => {
    mockResolveModuleUrl.mockImplementationOnce(() => {
      throw createNodeError('ERR_MODULE_NOT_FOUND', 'Module not found')
    })

    expect(() => getLocalPackageDir(mockModuleId, mockWorkDir)).toThrow('Module not found')
  })

  test('throws when both resolution strategies fail', () => {
    mockResolveModuleUrl
      .mockImplementationOnce(() => {
        throw createNodeError('ERR_PACKAGE_PATH_NOT_EXPORTED', 'Package path not exported')
      })
      .mockImplementationOnce(() => {
        throw createNodeError('ERR_MODULE_NOT_FOUND', 'Module not found')
      })

    expect(() => getLocalPackageDir(mockModuleId, mockWorkDir)).toThrow('Module not found')
  })
})
