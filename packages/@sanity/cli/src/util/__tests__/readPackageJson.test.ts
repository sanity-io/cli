// Import the mocked module
import {readFile} from 'node:fs/promises'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type PackageJsonWithDeps, readPackageJson} from '../readPackageJson'

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

  describe('basic functionality', () => {
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
  })

  describe('backward compatibility with boolean parameter', () => {
    test('accepts boolean true for skipSchemaValidation', async () => {
      // Missing required fields but validation is skipped
      const invalidPackage = {
        version: '1.0.0',
        // name is missing
      }

      vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(invalidPackage))

      const result = await readPackageJson(mockFilePath, true)

      expect(result).toEqual(invalidPackage)
      expect(result.name).toBeUndefined()
    })

    test('accepts boolean false for validation enabled', async () => {
      const validPackage = {
        name: '@sanity/test',
        version: '1.0.0',
      }

      vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(validPackage))

      const result = await readPackageJson(mockFilePath, false)

      expect(result).toEqual(validPackage)
    })
  })

  describe('skipSchemaValidation option', () => {
    test('skips validation when skipSchemaValidation is true', async () => {
      const invalidPackage = {
        version: '1.0.0',
        // name is missing
      }

      vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(invalidPackage))

      const result = await readPackageJson(mockFilePath, {skipSchemaValidation: true})

      expect(result).toEqual(invalidPackage)
      expect(result.name).toBeUndefined()
    })

    test('validates schema when skipSchemaValidation is false', async () => {
      const invalidPackage = {
        version: '1.0.0',
        // name is missing
      }

      vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(invalidPackage))

      await expect(readPackageJson(mockFilePath, {skipSchemaValidation: false})).rejects.toThrow(
        'Invalid package.json',
      )
    })
  })

  describe('defaults option', () => {
    test('merges defaults with parsed package.json', async () => {
      const filePackage = {
        name: '@sanity/test',
        version: '2.0.0',
      }

      const defaults = {
        author: 'Default Author',
        license: 'MIT',
        version: '1.0.0', // Will be overridden
      }

      vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(filePackage))

      const result = await readPackageJson(mockFilePath, {defaults})

      expect(result.name).toBe('@sanity/test')
      expect(result.version).toBe('2.0.0') // From file, not defaults
      expect(result.author).toBe('Default Author') // From defaults
      expect(result.license).toBe('MIT') // From defaults
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
      expect(result.license).toBe('Apache-2.0') // Only this comes from defaults
    })

    test('defaults work with skipSchemaValidation', async () => {
      const filePackage = {
        version: '1.0.0',
        // name is missing
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
  })

  describe('ensureDependencies option', () => {
    test('ensures dependencies and devDependencies exist when enabled', async () => {
      const minimalPackage = {
        name: '@sanity/test',
        version: '1.0.0',
      }

      vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(minimalPackage))

      // @ts-expect-error - Type annotation needed for test but causes TS error with overloads
      const result: PackageJsonWithDeps = await readPackageJson(mockFilePath, {
        ensureDependencies: true,
      })

      expect(result.dependencies).toEqual({})
      expect(result.devDependencies).toEqual({})
      expect(result.name).toBe('@sanity/test')
      expect(result.version).toBe('1.0.0')
    })

    test('preserves existing dependencies when ensureDependencies is enabled', async () => {
      const packageWithDeps = {
        dependencies: {
          'existing-dep': '^1.0.0',
        },
        name: '@sanity/test',
        version: '1.0.0',
      }

      vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(packageWithDeps))

      const result = await readPackageJson(mockFilePath, {
        ensureDependencies: true,
      })

      expect(result.dependencies).toEqual({'existing-dep': '^1.0.0'})
      expect(result.devDependencies).toEqual({}) // Ensured as empty
    })

    test('type safety: ensureDependencies guarantees non-optional dependency fields', async () => {
      const minimalPackage = {
        name: '@sanity/test',
        version: '1.0.0',
      }

      vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(minimalPackage))

      // This should type-check correctly with the function overload
      const result = await readPackageJson(mockFilePath, {
        ensureDependencies: true,
      })

      // Dependencies and devDependencies should be guaranteed to exist
      expect(result.dependencies).toEqual({})
      expect(result.devDependencies).toEqual({})
    })

    test('returns regular PackageJson when ensureDependencies is false', async () => {
      const minimalPackage = {
        name: '@sanity/test',
        version: '1.0.0',
      }

      vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(minimalPackage))

      const result = await readPackageJson(mockFilePath, {ensureDependencies: false})

      expect(result.dependencies).toBeUndefined()
      expect(result.devDependencies).toBeUndefined()
    })
  })

  describe('combined options', () => {
    test('all options work together', async () => {
      const filePackage = {
        version: '2.0.0',
        // name is missing
      }

      const defaults = {
        author: 'Default Author',
        name: '@sanity/default',
      }

      vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(filePackage))

      const result = await readPackageJson(mockFilePath, {
        defaults,
        ensureDependencies: true,
        skipSchemaValidation: true,
      })

      expect(result.name).toBe('@sanity/default')
      expect(result.version).toBe('2.0.0')
      expect(result.author).toBe('Default Author')
      expect(result.dependencies).toEqual({})
      expect(result.devDependencies).toEqual({})
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
        ensureDependencies: true,
      })

      expect(result.dependencies).toEqual({'default-dep': '^1.0.0'})
      expect(result.devDependencies).toEqual({'default-dev-dep': '^2.0.0'})
    })
  })

  describe('error handling', () => {
    test('provides clear error message for invalid JSON', async () => {
      vi.mocked(readFile).mockResolvedValueOnce('{invalid json')

      await expect(readPackageJson(mockFilePath)).rejects.toThrow('Failed to read')
    })

    test('provides clear error message for schema validation failures', async () => {
      const invalidPackage = {
        name: 123, // Should be string
        version: '1.0.0',
      }

      vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(invalidPackage))

      await expect(readPackageJson(mockFilePath)).rejects.toThrow('Invalid package.json')
    })

    test('includes file path in error messages', async () => {
      const mockError = new Error('ENOENT: no such file or directory')
      vi.mocked(readFile).mockRejectedValueOnce(mockError)

      await expect(readPackageJson(mockFilePath)).rejects.toThrow(
        `Failed to read "${mockFilePath}"`,
      )
    })
  })
})
