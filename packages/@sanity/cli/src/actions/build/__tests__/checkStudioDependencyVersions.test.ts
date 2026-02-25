import {type Output} from '@sanity/cli-core'
import semver from 'semver'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {checkStudioDependencyVersions} from '../checkStudioDependencyVersions.js'

const mockReadPackageJson = vi.hoisted(() => vi.fn())
const mockGetLocalPackageVersion = vi.hoisted(() => vi.fn())

vi.mock('../../../util/getLocalPackageVersion.js', () => ({
  getLocalPackageVersion: mockGetLocalPackageVersion,
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    readPackageJson: mockReadPackageJson,
  }
})

describe('checkStudioDependencyVersions', () => {
  const workDir = '/test/work/dir'
  let mockOutput: Output

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function createMockOutput(): Output {
    return {
      error: vi.fn().mockImplementation((_: Error | string, options?: {exit?: number}) => {
        if (options?.exit) {
          throw new Error('process.exit called')
        }
      }),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Output
  }

  /**
   * Helper to set up the project package.json mock and local package version mocks.
   * Only needs the project package.json (one call) and getLocalPackageVersion per package.
   */
  function setupMocks(opts: {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    localVersions?: Record<string, string | null>
  }) {
    mockOutput = createMockOutput()

    mockReadPackageJson.mockResolvedValue({
      dependencies: opts.dependencies ?? {},
      devDependencies: opts.devDependencies ?? {},
      name: 'test-project',
      version: '1.0.0',
    })

    if (opts.localVersions) {
      mockGetLocalPackageVersion.mockImplementation((name: string) => {
        const version = opts.localVersions?.[name]
        return Promise.resolve(version ?? null)
      })
    }
  }

  describe('when no dependencies are installed', () => {
    test('should not warn or error when no tracked packages are installed', async () => {
      setupMocks({})

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })
  })

  describe('when dependencies are installed', () => {
    test('should handle packages with valid versions', async () => {
      setupMocks({
        dependencies: {
          react: '^19.2.2',
          'react-dom': '^19.2.2',
        },
        localVersions: {
          react: '19.2.2',
          'react-dom': '19.2.2',
        },
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    test('should handle packages with untested versions (newer than supported)', async () => {
      setupMocks({
        dependencies: {react: '^20.0.0'},
        localVersions: {react: '20.0.0'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'The following package versions have not yet been marked as supported:',
        ),
      )
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining('react (installed: 20.0.0, want: ^19.2.2)'),
      )
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining('To downgrade, run either:'),
      )
    })

    test('should handle packages with unsupported versions (older than supported)', async () => {
      setupMocks({
        dependencies: {react: '^16.0.0'},
        localVersions: {react: '16.14.0'},
      })

      await expect(checkStudioDependencyVersions(workDir, mockOutput)).rejects.toThrow(
        'process.exit called',
      )

      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'The following package versions are no longer supported and needs to be upgraded:',
        ),
        {exit: 1},
      )
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('react (installed: 16.14.0, want: ^19.2.2)'),
        {exit: 1},
      )
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('To upgrade, run either:'),
        {exit: 1},
      )
    })

    test('should handle React 18 as unsupported', async () => {
      setupMocks({
        dependencies: {react: '^18.0.0'},
        localVersions: {react: '18.2.0'},
      })

      await expect(checkStudioDependencyVersions(workDir, mockOutput)).rejects.toThrow(
        'process.exit called',
      )

      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'The following package versions are no longer supported and needs to be upgraded:',
        ),
        {exit: 1},
      )
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('react (installed: 18.2.0, want: ^19.2.2)'),
        {exit: 1},
      )
    })

    test('should warn about deprecated packages when deprecatedBelow is set', async () => {
      setupMocks({
        dependencies: {react: '^17.0.0'},
        localVersions: {react: '17.0.2'},
      })

      // Use injectable packages parameter to test the deprecated code path
      await checkStudioDependencyVersions(workDir, mockOutput, {
        packages: [{deprecatedBelow: '18.0.0', name: 'react', supported: ['^17', '^18']}],
      })

      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'The following package versions have been deprecated and should be upgraded:',
        ),
      )
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining('react (installed: 17.0.2, want: 18.0.0)'),
      )
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining('Support for these will be removed in a future release!'),
      )
    })

    test('should handle packages installed in devDependencies', async () => {
      setupMocks({
        devDependencies: {react: '^19.2.2'},
        localVersions: {react: '19.2.2'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    test('should fall back to dependency version string when local version cannot be resolved', async () => {
      setupMocks({
        dependencies: {react: '^19.2.2'},
        localVersions: {react: null},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      // When getLocalPackageVersion returns null, the function falls back to
      // dependency.replaceAll(/[\D.]/g, '') which strips all non-digit and dot characters.
      // "^18.0.0" becomes "1800" which semver.coerce turns into 1800.0.0.
      // This is much higher than the supported range (^18 || ^19), so it's classified as "untested".
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'The following package versions have not yet been marked as supported:',
        ),
      )
    })

    test('should skip packages where version cannot be coerced', async () => {
      setupMocks({
        dependencies: {react: 'invalid-version'},
        localVersions: {react: null},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      // "invalid-version" stripped of non-digit/dot chars becomes "" which semver.coerce returns null for
      // The function returns false for this package and skips it
      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    test('should handle mixed package states correctly', async () => {
      setupMocks({
        dependencies: {
          react: '^16.0.0', // unsupported (older)
          'react-dom': '^20.0.0', // untested (newer)
          'styled-components': '^6.0.0', // supported
        },
        localVersions: {
          react: '16.14.0',
          'react-dom': '20.0.0',
          'styled-components': '6.1.0',
        },
      })

      await expect(checkStudioDependencyVersions(workDir, mockOutput)).rejects.toThrow(
        'process.exit called',
      )

      // Should warn about untested versions
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining('react-dom (installed: 20.0.0, want: ^19.2.2)'),
      )

      // Should error about unsupported versions
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('react (installed: 16.14.0, want: ^19.2.2)'),
        {exit: 1},
      )
    })
  })

  describe('helper functions', () => {
    test('should handle invalid version ranges in upgrade instructions', async () => {
      // Test the edge case where semver.coerce returns null in getUpgradeInstructions,
      // falling back to {version: ''}
      const originalCoerce = semver.coerce
      let coerceCallCount = 0
      vi.spyOn(semver, 'coerce').mockImplementation((version) => {
        coerceCallCount++
        // Return null for the version range strings in getUpgradeInstructions
        if (
          coerceCallCount > 1 &&
          version &&
          typeof version === 'string' &&
          version.includes('^')
        ) {
          return null
        }
        return originalCoerce(version)
      })

      setupMocks({
        dependencies: {react: '^16.0.0'},
        localVersions: {react: '16.14.0'},
      })

      await expect(checkStudioDependencyVersions(workDir, mockOutput)).rejects.toThrow(
        'process.exit called',
      )

      // Should still generate instructions even with invalid version range
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('To upgrade, run either:'),
        {exit: 1},
      )
    })

    test('should generate correct upgrade instructions', async () => {
      setupMocks({
        dependencies: {react: '^16.0.0'},
        localVersions: {react: '16.14.0'},
      })

      await expect(checkStudioDependencyVersions(workDir, mockOutput)).rejects.toThrow(
        'process.exit called',
      )

      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('npm install "react@^19.2.2"'),
        {exit: 1},
      )
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('yarn add "react@^19.2.2"'),
        {exit: 1},
      )
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('pnpm add "react@^19.2.2"'),
        {exit: 1},
      )
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('Read more at https://www.sanity.io/docs/help/upgrade-packages'),
        {exit: 1},
      )
    })

    test('should generate correct downgrade instructions', async () => {
      setupMocks({
        dependencies: {react: '^20.0.0'},
        localVersions: {react: '20.0.0'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining('yarn add "react@^19.2.2"'),
      )
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining('npm install "react@^19.2.2"'),
      )
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining('pnpm install "react@^19.2.2"'),
      )
    })

    test('should list multiple packages correctly', async () => {
      setupMocks({
        dependencies: {
          react: '^16.0.0',
          'react-dom': '^16.0.0',
        },
        localVersions: {
          react: '16.14.0',
          'react-dom': '16.14.0',
        },
      })

      await expect(checkStudioDependencyVersions(workDir, mockOutput)).rejects.toThrow(
        'process.exit called',
      )

      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('react (installed: 16.14.0, want: ^19.2.2)'),
        {exit: 1},
      )
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('react-dom (installed: 16.14.0, want: ^19.2.2)'),
        {exit: 1},
      )
    })
  })

  describe('edge cases', () => {
    test('should handle readPackageJson throwing an error', async () => {
      mockOutput = createMockOutput()
      mockReadPackageJson.mockRejectedValue(new Error('Failed to read package.json'))

      await expect(checkStudioDependencyVersions(workDir, mockOutput)).rejects.toThrow(
        'Failed to read package.json',
      )
    })

    test('should handle packages with no dependencies property', async () => {
      mockOutput = createMockOutput()
      mockReadPackageJson.mockResolvedValue({
        name: 'test-project',
        version: '1.0.0',
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    test('should handle packages with empty dependencies', async () => {
      setupMocks({})

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    test('should handle semver.coerce returning null', async () => {
      mockOutput = createMockOutput()
      mockReadPackageJson.mockResolvedValue({
        dependencies: {react: 'invalid-version'},
        name: 'test-project',
        version: '1.0.0',
      })
      mockGetLocalPackageVersion.mockResolvedValue(null)

      // Mock semver.coerce to return null for any input
      vi.spyOn(semver, 'coerce').mockReturnValue(null)

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    test('should handle @sanity/ui v3 package correctly', async () => {
      setupMocks({
        dependencies: {'@sanity/ui': '^3.0.0'},
        localVersions: {'@sanity/ui': '3.0.0'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    test('should warn about @sanity/ui v2 being deprecated', async () => {
      setupMocks({
        dependencies: {'@sanity/ui': '^2.0.0'},
        localVersions: {'@sanity/ui': '2.8.0'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'The following package versions have been deprecated and should be upgraded:',
        ),
      )
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining('@sanity/ui (installed: 2.8.0, want: ^3)'),
      )
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining('Support for these will be removed in a future release!'),
      )
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    test('should handle styled-components package correctly', async () => {
      setupMocks({
        dependencies: {'styled-components': '^6.0.0'},
        localVersions: {'styled-components': '6.1.0'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })
  })
})
