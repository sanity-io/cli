import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {findProjectRootSync} from '../findProjectRootSync'

function createMockPath(unixPath: string): string {
  if (process.platform === 'win32') {
    // Convert Unix path to Windows path
    // /mock/project/path' => C:\mock\project\path
    return `C:${unixPath.replaceAll('/', '\\')}`
  }
  return unixPath
}

// Mock node:fs since configPathsSync uses it directly
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  }
})

describe('findProjectRootSync', () => {
  const mockCwd = createMockPath('/mock/project/path')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  test('finds a TypeScript studio config in the current directory', async () => {
    const {existsSync} = await import('node:fs')

    vi.mocked(existsSync).mockImplementation((path) => {
      return path === join(mockCwd, 'sanity.config.ts')
    })

    const result = findProjectRootSync(mockCwd)
    expect(result).toEqual({
      directory: mockCwd,
      path: join(mockCwd, 'sanity.config.ts'),
      type: 'studio',
    })
  })

  test('finds a JavaScript studio config in the current directory', async () => {
    const {existsSync} = await import('node:fs')

    vi.mocked(existsSync).mockImplementation((path) => {
      return path === join(mockCwd, 'sanity.config.js')
    })

    const result = findProjectRootSync(mockCwd)
    expect(result).toEqual({
      directory: mockCwd,
      path: join(mockCwd, 'sanity.config.js'),
      type: 'studio',
    })
  })

  test('finds a TypeScript app config in the current directory', async () => {
    const {existsSync} = await import('node:fs')

    vi.mocked(existsSync).mockImplementation((path) => {
      return path === join(mockCwd, 'sanity.cli.ts')
    })

    const result = findProjectRootSync(mockCwd)
    expect(result).toEqual({
      directory: mockCwd,
      path: join(mockCwd, 'sanity.cli.ts'),
      type: 'app',
    })
  })

  test('finds a JavaScript app config in the current directory', async () => {
    const {existsSync} = await import('node:fs')

    vi.mocked(existsSync).mockImplementation((path) => {
      return path === join(mockCwd, 'sanity.cli.js')
    })

    const result = findProjectRootSync(mockCwd)
    expect(result).toEqual({
      directory: mockCwd,
      path: join(mockCwd, 'sanity.cli.js'),
      type: 'app',
    })
  })

  test('prioritizes studio config over app config when both are present', async () => {
    const {existsSync} = await import('node:fs')

    vi.mocked(existsSync).mockImplementation((path) => {
      return path === join(mockCwd, 'sanity.config.ts') || path === join(mockCwd, 'sanity.cli.ts')
    })

    const result = findProjectRootSync(mockCwd)
    expect(result).toEqual({
      directory: mockCwd,
      path: join(mockCwd, 'sanity.config.ts'),
      type: 'studio',
    })
  })

  test('recursively searches parent directories for config', async () => {
    const {existsSync} = await import('node:fs')
    const parentPath = createMockPath('/mock/project')

    vi.mocked(existsSync).mockImplementation((path) => {
      return path === join(parentPath, 'sanity.config.ts')
    })

    const result = findProjectRootSync(mockCwd)
    expect(result).toEqual({
      directory: parentPath,
      path: join(parentPath, 'sanity.config.ts'),
      type: 'studio',
    })
  })

  test('throws error when no config is found', async () => {
    const {existsSync, readFileSync} = await import('node:fs')

    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({root: false}))

    expect(() => findProjectRootSync(mockCwd)).toThrow('No project root found')
  })

  test('throws error when v2 studio root is found', async () => {
    const {existsSync, readFileSync} = await import('node:fs')

    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({root: true}))

    expect(() => findProjectRootSync(mockCwd)).toThrow(
      `Found 'sanity.json' at ${createMockPath('/mock/project/path')} - Sanity Studio < v3 is no longer supported`,
    )
  })
})
