// Import the mocked module
import {readFile} from 'node:fs/promises'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {readPackageJson} from '../readPackageJson'

// Mock the node:fs/promises module
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))

describe('readPackageJson', () => {
  const mockFilePath = '/mock/path/package.json'

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns parsed package.json content when file is valid', async () => {
    const mockPackage = {
      dependencies: {
        'some-dep': '^1.0.0',
      },
      devDependencies: {
        'some-dev-dep': '^2.0.0',
      },
      name: '@sanity/test-package',
      version: '1.0.0',
    }

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(mockPackage))

    const result = await readPackageJson(mockFilePath)

    expect(readFile).toHaveBeenCalledWith(mockFilePath, 'utf8')
    expect(result).toEqual(mockPackage)
  })

  test('throws error when file cannot be read', async () => {
    const mockError = new Error('File not found')
    vi.mocked(readFile).mockRejectedValueOnce(mockError)

    await expect(readPackageJson(mockFilePath)).rejects.toThrow('Failed to read')
    expect(readFile).toHaveBeenCalledWith(mockFilePath, 'utf8')
  })

  test('throws error when JSON is invalid', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('invalid json content')

    await expect(readPackageJson(mockFilePath)).rejects.toThrow()
    expect(readFile).toHaveBeenCalledWith(mockFilePath, 'utf8')
  })

  test('throws error when required fields are missing', async () => {
    // Missing name field
    const invalidPackage = {
      version: '1.0.0',
    }

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(invalidPackage))

    await expect(readPackageJson(mockFilePath)).rejects.toThrow('Invalid package.json')
    expect(readFile).toHaveBeenCalledWith(mockFilePath, 'utf8')
  })

  test('handles optional fields correctly', async () => {
    // Only required fields, no optional ones
    const minimalPackage = {
      name: '@sanity/minimal',
      version: '1.0.0',
    }

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(minimalPackage))

    const result = await readPackageJson(mockFilePath)

    expect(readFile).toHaveBeenCalledWith(mockFilePath, 'utf8')
    expect(result).toEqual(minimalPackage)
    expect(result.dependencies).toBeUndefined()
    expect(result.devDependencies).toBeUndefined()
    expect(result.peerDependencies).toBeUndefined()
  })
})
