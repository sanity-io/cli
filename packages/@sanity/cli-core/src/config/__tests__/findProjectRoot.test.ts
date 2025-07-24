import {access} from 'node:fs/promises'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {readJsonFile} from '../../util/readJsonFile'
import {findProjectRoot} from '../findProjectRoot'

// Mock the fs/promises module
vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}))

// Mock the readJsonFile utility
vi.mock('../../util/readJsonFile', () => ({
  readJsonFile: vi.fn(),
}))

describe('#findProjectRoot', () => {
  const mockCwd = '/mock/project/path'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  test('finds a TypeScript studio config in the current directory', async () => {
    // Mock access to return true for sanity.config.ts
    vi.mocked(access).mockImplementation((path) => {
      if (path === join(mockCwd, 'sanity.config.ts')) {
        return Promise.resolve()
      }
      return Promise.reject(new Error('File not found'))
    })

    const result = await findProjectRoot(mockCwd)
    expect(result).toEqual({
      directory: mockCwd,
      path: join(mockCwd, 'sanity.config.ts'),
      type: 'studio',
    })
  })

  test('finds a JavaScript studio config in the current directory', async () => {
    // Mock access to return true for sanity.config.js
    vi.mocked(access).mockImplementation((path) => {
      if (path === join(mockCwd, 'sanity.config.js')) {
        return Promise.resolve()
      }
      return Promise.reject(new Error('File not found'))
    })

    const result = await findProjectRoot(mockCwd)
    expect(result).toEqual({
      directory: mockCwd,
      path: join(mockCwd, 'sanity.config.js'),
      type: 'studio',
    })
  })

  test('throws error when multiple config files are found', async () => {
    // Mock access to return true for multiple config files
    vi.mocked(access).mockImplementation((path) => {
      if (
        path === join(mockCwd, 'sanity.config.ts') ||
        path === join(mockCwd, 'sanity.config.js')
      ) {
        return Promise.resolve()
      }
      return Promise.reject(new Error('File not found'))
    })

    await expect(findProjectRoot(mockCwd)).rejects.toThrow(
      'Multiple studio config files found (sanity.config.ts, sanity.config.js)',
    )
  })

  test('throws error when v2 studio root is found', async () => {
    // Mock access to reject all config files
    vi.mocked(access).mockRejectedValue(new Error('File not found'))

    // Mock readJsonFile to return a v2 config
    vi.mocked(readJsonFile).mockResolvedValue({root: true})

    await expect(findProjectRoot(mockCwd)).rejects.toThrow(
      "Found 'sanity.json' at /mock/project/path - Sanity Studio < v3 is no longer supported",
    )
  })

  test('recursively searches parent directories for config', async () => {
    const parentPath = '/mock/project'

    // Mock access to return true only for config in parent directory
    vi.mocked(access).mockImplementation((path) => {
      if (path === join(parentPath, 'sanity.config.ts')) {
        return Promise.resolve()
      }
      return Promise.reject(new Error('File not found'))
    })

    const result = await findProjectRoot(mockCwd)
    expect(result).toEqual({
      directory: parentPath,
      path: join(parentPath, 'sanity.config.ts'),
      type: 'studio',
    })
  })

  test('throws error when no config is found', async () => {
    // Mock access to reject all files
    vi.mocked(access).mockRejectedValue(new Error('File not found'))

    // Mock readJsonFile to return non-root config
    vi.mocked(readJsonFile).mockResolvedValue({root: false})

    await expect(findProjectRoot(mockCwd)).rejects.toThrow('No project root found')
  })

  test('throws an error if v2 studio root is found', async () => {
    vi.mocked(readJsonFile).mockResolvedValue({root: true})

    await expect(findProjectRoot(mockCwd)).rejects.toThrow(
      "Found 'sanity.json' at /mock/project/path - Sanity Studio < v3 is no longer supported",
    )
  })

  test('finds a TypeScript app config in the current directory', async () => {
    // Mock access to return true for sanity.cli.ts
    vi.mocked(access).mockImplementation((path) => {
      if (path === join(mockCwd, 'sanity.cli.ts')) {
        return Promise.resolve()
      }
      return Promise.reject(new Error('File not found'))
    })

    const result = await findProjectRoot(mockCwd)
    expect(result).toEqual({
      directory: mockCwd,
      path: join(mockCwd, 'sanity.cli.ts'),
      type: 'app',
    })
  })

  test('finds a JavaScript app config in the current directory', async () => {
    // Mock access to return true for sanity.cli.js
    vi.mocked(access).mockImplementation((path) => {
      if (path === join(mockCwd, 'sanity.cli.js')) {
        return Promise.resolve()
      }
      return Promise.reject(new Error('File not found'))
    })

    const result = await findProjectRoot(mockCwd)
    expect(result).toEqual({
      directory: mockCwd,
      path: join(mockCwd, 'sanity.cli.js'),
      type: 'app',
    })
  })

  test('throws error when multiple app config files are found', async () => {
    // Mock access to return true for multiple app config files
    vi.mocked(access).mockImplementation((path) => {
      if (path === join(mockCwd, 'sanity.cli.ts') || path === join(mockCwd, 'sanity.cli.js')) {
        return Promise.resolve()
      }
      return Promise.reject(new Error('File not found'))
    })

    await expect(findProjectRoot(mockCwd)).rejects.toThrow('Multiple app config files found')
  })

  test('prioritizes studio config over app config when both are present', async () => {
    // Mock access to return true for both studio and app config files
    vi.mocked(access).mockImplementation((path) => {
      if (path === join(mockCwd, 'sanity.config.ts') || path === join(mockCwd, 'sanity.cli.ts')) {
        return Promise.resolve()
      }
      return Promise.reject(new Error('File not found'))
    })

    const result = await findProjectRoot(mockCwd)
    expect(result).toEqual({
      directory: mockCwd,
      path: join(mockCwd, 'sanity.config.ts'),
      type: 'studio',
    })
  })
})
