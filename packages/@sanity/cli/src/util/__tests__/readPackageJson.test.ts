import {readFile} from 'node:fs/promises'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {readPackageJson} from '../readPackageJson'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))

describe('readPackageJson', () => {
  const mockFilePath = '/mock/path/package.json'

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
    const invalidPackage = {
      version: '1.0.0',
    }

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(invalidPackage))

    await expect(readPackageJson(mockFilePath)).rejects.toThrow('Invalid package.json')
    expect(readFile).toHaveBeenCalledWith(mockFilePath, 'utf8')
  })

  test('handles optional fields correctly', async () => {
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

  test('includes all metadata fields from schema', async () => {
    const fullPackage = {
      author: 'Test Author',
      dependencies: {dep: '^1.0.0'},
      description: 'A test package',
      devDependencies: {'dev-dep': '^2.0.0'},
      engines: {node: '>=18'},
      exports: {'./index': './dist/index.js'},
      license: 'MIT',
      main: 'dist/index.js',
      name: '@sanity/full',
      peerDependencies: {peer: '^3.0.0'},
      private: true,
      repository: {type: 'git', url: 'https://github.com/test/test'},
      scripts: {test: 'vitest'},
      types: 'dist/index.d.ts',
      version: '1.0.0',
    }

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(fullPackage))

    const result = await readPackageJson(mockFilePath)

    expect(result).toEqual(fullPackage)
    expect(result.author).toBe('Test Author')
    expect(result.description).toBe('A test package')
    expect(result.license).toBe('MIT')
    expect(result.private).toBe(true)
    expect(result.repository).toEqual({type: 'git', url: 'https://github.com/test/test'})
    expect(result.engines).toEqual({node: '>=18'})
    expect(result.scripts).toEqual({test: 'vitest'})
  })

  test('skips validation when skipSchemaValidation is true', async () => {
    const invalidPackage = {
      version: '1.0.0',
    }

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(invalidPackage))

    const result = await readPackageJson(mockFilePath, {skipSchemaValidation: true})

    expect(result).toEqual(invalidPackage)
    expect(result.name).toBeUndefined()
  })

  test('validates schema when skipSchemaValidation is false', async () => {
    const invalidPackage = {
      version: '1.0.0',
    }

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(invalidPackage))

    await expect(readPackageJson(mockFilePath, {skipSchemaValidation: false})).rejects.toThrow(
      'Invalid package.json',
    )
  })

  test('merges defaults with parsed package.json', async () => {
    const filePackage = {
      name: '@sanity/test',
      version: '2.0.0',
    }

    const defaults = {
      author: 'Default Author',
      license: 'MIT',
      version: '1.0.0',
    }

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(filePackage))

    const result = await readPackageJson(mockFilePath, {defaults})

    expect(result.name).toBe('@sanity/test')
    expect(result.version).toBe('2.0.0')
    expect(result.author).toBe('Default Author')
    expect(result.license).toBe('MIT')
  })

  test('parsed values take precedence over defaults', async () => {
    const filePackage = {
      author: 'File Author',
      description: 'File description',
      name: '@sanity/test',
      version: '1.0.0',
    }

    const defaults = {
      author: 'Default Author',
      description: 'Default description',
      license: 'Apache-2.0',
    }

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(filePackage))

    const result = await readPackageJson(mockFilePath, {defaults})

    expect(result.author).toBe('File Author')
    expect(result.description).toBe('File description')
    expect(result.license).toBe('Apache-2.0')
  })

  test('defaults work with skipSchemaValidation', async () => {
    const filePackage = {
      version: '1.0.0',
    }

    const defaults = {
      name: '@sanity/default',
    }

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(filePackage))

    const result = await readPackageJson(mockFilePath, {
      defaults,
      skipSchemaValidation: true,
    })

    expect(result.name).toBe('@sanity/default')
    expect(result.version).toBe('1.0.0')
  })

  test('defaults can provide dependency objects', async () => {
    const filePackage = {
      name: '@sanity/test',
      version: '1.0.0',
    }

    const defaults = {
      dependencies: {
        'default-dep': '^1.0.0',
      },
      devDependencies: {
        'default-dev-dep': '^2.0.0',
      },
    }

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(filePackage))

    const result = await readPackageJson(mockFilePath, {
      defaults,
    })

    expect(result.dependencies).toEqual({'default-dep': '^1.0.0'})
    expect(result.devDependencies).toEqual({'default-dev-dep': '^2.0.0'})
  })

  test('allows unknown fields to pass through', async () => {
    const filePackage = {
      name: '@sanity/test',
      unknownField: 'unknown value',
      version: '1.0.0',
    }

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(filePackage))

    const result = await readPackageJson(mockFilePath)

    expect(result.unknownField).toBe('unknown value')
  })
})
