import {join} from 'node:path'

// Import the mocked modules
import resolveFrom from 'resolve-from'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getLocalPackageVersion} from '../getLocalPackageVersion'
import {readPackageJson} from '../readPackageJson.js'

// Mock the dependencies
vi.mock('resolve-from', () => ({
  default: {
    silent: vi.fn(),
  },
}))

vi.mock('../readPackageJson', () => ({
  readPackageJson: vi.fn(),
}))

describe('getLocalPackageVersion', () => {
  const mockWorkDir = '/mock/work/dir'
  const mockModuleId = '@sanity/test'

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns version when package.json is directly resolved', async () => {
    const mockPath = join(mockWorkDir, 'node_modules', mockModuleId, 'package.json')
    const mockVersion = '1.0.0'

    vi.mocked(resolveFrom.silent).mockReturnValueOnce(mockPath)
    vi.mocked(readPackageJson).mockResolvedValueOnce({
      name: mockModuleId,
      version: mockVersion,
    })

    const result = await getLocalPackageVersion(mockModuleId, mockWorkDir)

    expect(resolveFrom.silent).toHaveBeenCalledWith(mockWorkDir, join(mockModuleId, 'package.json'))
    expect(readPackageJson).toHaveBeenCalledWith(mockPath)
    expect(result).toBe(mockVersion)
  })

  test('handles packages with exports field when direct resolution fails', async () => {
    const modulePath = join(mockWorkDir, 'node_modules', mockModuleId, 'index.js')
    const moduleRoot = join(mockWorkDir, 'node_modules', mockModuleId)
    const manifestPath = join(moduleRoot, 'package.json')
    const mockVersion = '2.0.0'

    // First call returns null (direct package.json resolution fails)
    vi.mocked(resolveFrom.silent).mockReturnValueOnce(undefined)
    // Second call succeeds (resolving the module itself)
    vi.mocked(resolveFrom.silent).mockReturnValueOnce(modulePath)
    vi.mocked(readPackageJson).mockResolvedValueOnce({
      name: mockModuleId,
      version: mockVersion,
    })

    const result = await getLocalPackageVersion(mockModuleId, mockWorkDir)

    expect(resolveFrom.silent).toHaveBeenCalledWith(mockWorkDir, join(mockModuleId, 'package.json'))
    expect(resolveFrom.silent).toHaveBeenCalledWith(mockWorkDir, mockModuleId)
    expect(readPackageJson).toHaveBeenCalledWith(manifestPath)
    expect(result).toBe(mockVersion)
  })

  test('returns undefined when module cannot be resolved at all', async () => {
    // Both resolution attempts fail
    vi.mocked(resolveFrom.silent).mockReturnValueOnce(undefined)
    vi.mocked(resolveFrom.silent).mockReturnValueOnce(undefined)

    const result = await getLocalPackageVersion(mockModuleId, mockWorkDir)

    expect(resolveFrom.silent).toHaveBeenCalledWith(mockWorkDir, join(mockModuleId, 'package.json'))
    expect(resolveFrom.silent).toHaveBeenCalledWith(mockWorkDir, mockModuleId)
    expect(readPackageJson).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  test('uses process.cwd() when workDir is not provided', async () => {
    const mockCwd = '/current/working/dir'
    const mockPath = join(mockCwd, 'node_modules', mockModuleId, 'package.json')
    const mockVersion = '3.0.0'

    vi.spyOn(process, 'cwd').mockReturnValue(mockCwd)
    vi.mocked(resolveFrom.silent).mockReturnValueOnce(mockPath)
    vi.mocked(readPackageJson).mockResolvedValueOnce({
      name: mockModuleId,
      version: mockVersion,
    })

    const result = await getLocalPackageVersion(mockModuleId, '')

    expect(resolveFrom.silent).toHaveBeenCalledWith(mockCwd, join(mockModuleId, 'package.json'))
    expect(readPackageJson).toHaveBeenCalledWith(mockPath)
    expect(result).toBe(mockVersion)
  })
})
