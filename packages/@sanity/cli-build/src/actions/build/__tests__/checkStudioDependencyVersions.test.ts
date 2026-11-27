import path from 'node:path'

import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {type Output} from '@sanity/cli-core/types'
import {
  getLocalPackageDir,
  getLocalPackageVersion,
  readPackageJson,
} from '@sanity/cli-test/mocks/cli-core/package-manager'
import {createMockOutput} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {coerce} from 'semver'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {checkStudioDependencyVersions} from '../checkStudioDependencyVersions.js'

vi.mock('semver', {spy: true})

vi.mock(
  import('@sanity/cli-core/package-manager'),
  () => import('@sanity/cli-test/mocks/cli-core/package-manager'),
)

const PUBLISHED_SANITY_PEERS = {
  react: '^19.2.2',
  'react-dom': '^19.2.2',
  'styled-components': '^6.1.15',
}

/**
 * Helper to set up the project package.json mock and local package version mocks.
 * Only needs the project package.json (one call) and getLocalPackageVersion per package.
 */
function setupMocks(opts: {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  localVersions?: Record<string, string | null>
  sanityPeerDependencies?: Record<string, string>
}) {
  const sanityPeerDependencies =
    'sanityPeerDependencies' in opts ? opts.sanityPeerDependencies : PUBLISHED_SANITY_PEERS

  const projectManifest = {
    dependencies: opts.dependencies ?? {},
    devDependencies: opts.devDependencies ?? {},
    name: 'test-project',
    version: '1.0.0',
  }

  const sanityDir = path.join('/test/work/dir', 'node_modules', 'sanity')
  getLocalPackageDir.mockReturnValue(sanityDir)
  readPackageJson.mockImplementation((filePath: string) =>
    Promise.resolve(
      filePath === path.join(sanityDir, 'package.json')
        ? {name: 'sanity', peerDependencies: sanityPeerDependencies, version: '7.0.0'}
        : projectManifest,
    ),
  )

  if (opts.localVersions) {
    getLocalPackageVersion.mockImplementation((name: string) => {
      const version = opts.localVersions?.[name]
      return Promise.resolve(version ?? null)
    })
  }
}

describe('checkStudioDependencyVersions', () => {
  const workDir = '/test/work/dir'
  let mockOutput: Output

  beforeEach(() => {
    mockOutput = createMockOutput()
  })
  afterEach(() => {
    // Use restore instead of reset to not clear out semver coerce mock that has a default implementation of executing
    vi.restoreAllMocks()
  })

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

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'The following package versions are no longer supported and needs to be upgraded:',
        ),
        {exit: exitCodes.RUNTIME_ERROR},
      )
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('react (installed: 16.14.0, want: ^19.2.2)'),
        {exit: exitCodes.RUNTIME_ERROR},
      )
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('To upgrade, run either:'),
        {exit: exitCodes.RUNTIME_ERROR},
      )
    })

    test('should accept react and react-dom 19.2.2 by default', async () => {
      setupMocks({
        dependencies: {react: '^19.2.2', 'react-dom': '^19.2.2'},
        localVersions: {react: '19.2.2', 'react-dom': '19.2.2'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    test('should handle React 18 as unsupported', async () => {
      setupMocks({
        dependencies: {react: '^18.0.0'},
        localVersions: {react: '18.2.0'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'The following package versions are no longer supported and needs to be upgraded:',
        ),
        {exit: exitCodes.RUNTIME_ERROR},
      )
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('react (installed: 18.2.0, want: ^19.2.2)'),
        {exit: exitCodes.RUNTIME_ERROR},
      )
    })

    test('should warn about deprecated packages when deprecatedBelow is set', async () => {
      setupMocks({
        dependencies: {react: '^17.0.0'},
        localVersions: {react: '17.0.2'},
        sanityPeerDependencies: undefined,
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
          'styled-components': '6.1.15',
        },
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      // Should warn about untested versions
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining('react-dom (installed: 20.0.0, want: ^19.2.2)'),
      )

      // Should error about unsupported versions
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('react (installed: 16.14.0, want: ^19.2.2)'),
        {exit: exitCodes.RUNTIME_ERROR},
      )
    })
  })

  describe('sanity peer dependency requirements', () => {
    const sanityPeerDependencies = {react: '^19.3.1', 'react-dom': '^19.3.1'}

    test.each(['18.2.0', '19.0.0', '19.2.2', '19.3.0'])(
      'should treat react and react-dom %s as unsupported when sanity requires ^19.3.1',
      async (version) => {
        setupMocks({
          dependencies: {react: `^${version}`, 'react-dom': `^${version}`},
          localVersions: {react: version, 'react-dom': version},
          sanityPeerDependencies,
        })

        await checkStudioDependencyVersions(workDir, mockOutput)

        expect(mockOutput.error).toHaveBeenCalledWith(
          expect.stringContaining(
            'The following package versions are no longer supported and needs to be upgraded:',
          ),
          {exit: exitCodes.RUNTIME_ERROR},
        )
        expect(mockOutput.error).toHaveBeenCalledWith(
          expect.stringContaining(`react (installed: ${version}, want: ^19.3.1)`),
          {exit: exitCodes.RUNTIME_ERROR},
        )
        expect(mockOutput.error).toHaveBeenCalledWith(
          expect.stringContaining(`react-dom (installed: ${version}, want: ^19.3.1)`),
          {exit: exitCodes.RUNTIME_ERROR},
        )
        expect(mockOutput.error).toHaveBeenCalledWith(
          expect.stringContaining('npm install "react@^19.3.1"'),
          {exit: exitCodes.RUNTIME_ERROR},
        )
      },
    )

    test('should accept react and react-dom 19.3.1 when sanity requires ^19.3.1', async () => {
      setupMocks({
        dependencies: {react: '^19.3.1', 'react-dom': '^19.3.1'},
        localVersions: {react: '19.3.1', 'react-dom': '19.3.1'},
        sanityPeerDependencies,
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    test('should ignore a sanity peer range that is not stricter than the default', async () => {
      setupMocks({
        dependencies: {react: '^19.2.2', 'react-dom': '^19.2.2'},
        localVersions: {react: '19.2.2', 'react-dom': '19.2.2'},
        sanityPeerDependencies: {react: '^18 || ^19', 'react-dom': '^18 || ^19'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    test('should ignore an invalid sanity peer range', async () => {
      setupMocks({
        dependencies: {react: '^19.2.2'},
        localVersions: {react: '19.2.2'},
        sanityPeerDependencies: {react: 'not a range'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    test('should use the default range when sanity cannot be resolved', async () => {
      setupMocks({
        dependencies: {react: '^19.2.2'},
        localVersions: {react: '19.2.2'},
        sanityPeerDependencies,
      })
      getLocalPackageDir.mockImplementation(() => {
        throw new Error('Cannot find module')
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    test.each(['6.1.0', '6.6.0'])(
      'should treat styled-components %s as unsupported when sanity requires ^6.7.0',
      async (version) => {
        setupMocks({
          dependencies: {'styled-components': `^${version}`},
          localVersions: {'styled-components': version},
          sanityPeerDependencies: {'styled-components': '^6.7.0'},
        })

        await checkStudioDependencyVersions(workDir, mockOutput)

        expect(mockOutput.error).toHaveBeenCalledWith(
          expect.stringContaining(
            'The following package versions are no longer supported and needs to be upgraded:',
          ),
          {exit: exitCodes.RUNTIME_ERROR},
        )
        expect(mockOutput.error).toHaveBeenCalledWith(
          expect.stringContaining(`styled-components (installed: ${version}, want: ^6.7.0)`),
          {exit: exitCodes.RUNTIME_ERROR},
        )
      },
    )

    test('should accept styled-components 6.7.0 when sanity requires ^6.7.0', async () => {
      setupMocks({
        dependencies: {'styled-components': '^6.7.0'},
        localVersions: {'styled-components': '6.7.0'},
        sanityPeerDependencies: {'styled-components': '^6.7.0'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    test('should treat styled-components 6.1.14 as unsupported by default', async () => {
      setupMocks({
        dependencies: {'styled-components': '^6.1.14'},
        localVersions: {'styled-components': '6.1.14'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('styled-components (installed: 6.1.14, want: ^6.1.15)'),
        {exit: exitCodes.RUNTIME_ERROR},
      )
    })

    test('should accept styled-components 6.1.15 by default', async () => {
      setupMocks({
        dependencies: {'styled-components': '^6.1.15'},
        localVersions: {'styled-components': '6.1.15'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    test('should warn about react and react-dom 20.0.0 when sanity requires ^19.3.1', async () => {
      setupMocks({
        dependencies: {react: '^20.0.0', 'react-dom': '^20.0.0'},
        localVersions: {react: '20.0.0', 'react-dom': '20.0.0'},
        sanityPeerDependencies,
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.error).not.toHaveBeenCalled()
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'The following package versions have not yet been marked as supported:',
        ),
      )
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining('react (installed: 20.0.0, want: ^19.3.1)'),
      )
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining('react-dom (installed: 20.0.0, want: ^19.3.1)'),
      )
    })

    test('should only apply sanity peer ranges to react, react-dom and styled-components', async () => {
      setupMocks({
        dependencies: {'@sanity/ui': '^3.0.0'},
        localVersions: {'@sanity/ui': '3.0.0'},
        sanityPeerDependencies: {'@sanity/ui': '^4'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    test('should use the default range when sanity declares no peer dependencies', async () => {
      setupMocks({
        dependencies: {react: '^19.2.2'},
        localVersions: {react: '19.2.2'},
        sanityPeerDependencies: undefined,
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })
  })

  describe('helper functions', () => {
    test('should handle invalid version ranges in upgrade instructions', async () => {
      const actualSemver = await vi.importActual<typeof import('semver')>('semver')
      // Test the edge case where semver.coerce returns null in getUpgradeInstructions,
      // falling back to {version: ''}
      let coerceCallCount = 0
      vi.mocked(coerce).mockImplementation((version) => {
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
        return actualSemver.coerce(version)
      })

      setupMocks({
        dependencies: {react: '^16.0.0'},
        localVersions: {react: '16.14.0'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      // Should still generate instructions even with invalid version range
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('To upgrade, run either:'),
        {exit: exitCodes.RUNTIME_ERROR},
      )
      vi.mocked(coerce).mockReset()
    })

    test('should generate correct upgrade instructions', async () => {
      setupMocks({
        dependencies: {react: '^16.0.0'},
        localVersions: {react: '16.14.0'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('npm install "react@^19.2.2"'),
        {exit: exitCodes.RUNTIME_ERROR},
      )
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('yarn add "react@^19.2.2"'),
        {exit: exitCodes.RUNTIME_ERROR},
      )
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('pnpm add "react@^19.2.2"'),
        {exit: exitCodes.RUNTIME_ERROR},
      )
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('Read more at https://www.sanity.io/docs/help/upgrade-packages'),
        {exit: exitCodes.RUNTIME_ERROR},
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

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('react (installed: 16.14.0, want: ^19.2.2)'),
        {exit: exitCodes.RUNTIME_ERROR},
      )
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('react-dom (installed: 16.14.0, want: ^19.2.2)'),
        {exit: exitCodes.RUNTIME_ERROR},
      )
    })
  })

  describe('edge cases', () => {
    test('should handle readPackageJson throwing an error', async () => {
      mockOutput = createMockOutput()
      readPackageJson.mockRejectedValue(new Error('Failed to read package.json'))

      await expect(checkStudioDependencyVersions(workDir, mockOutput)).rejects.toThrow(
        'Failed to read package.json',
      )
    })

    test('should handle packages with no dependencies property', async () => {
      mockOutput = createMockOutput()
      readPackageJson.mockResolvedValue({
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
      readPackageJson.mockResolvedValue({
        dependencies: {react: 'invalid-version'},
        name: 'test-project',
        version: '1.0.0',
      })
      getLocalPackageVersion.mockResolvedValue(null)

      // Mock coerce to return null for any input
      vi.mocked(coerce).mockReturnValue(null)

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
      vi.mocked(coerce).mockReset()
    })

    test('should handle @sanity/ui v4 package as supported', async () => {
      setupMocks({
        dependencies: {'@sanity/ui': '^4.0.0'},
        localVersions: {'@sanity/ui': '4.0.3'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    test('should handle @sanity/ui v3 package as supported', async () => {
      setupMocks({
        dependencies: {'@sanity/ui': '^3.0.0'},
        localVersions: {'@sanity/ui': '3.5.2'},
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

      expect(mockOutput.error).not.toHaveBeenCalled()
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
    })

    test('should treat @sanity/ui below v2 as unsupported with the supported range', async () => {
      setupMocks({
        dependencies: {'@sanity/ui': '^1.0.0'},
        localVersions: {'@sanity/ui': '1.0.0'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('@sanity/ui (installed: 1.0.0, want: ^2 || ^3 || ^4)'),
        {exit: 1},
      )
    })

    test('should warn about @sanity/ui versions newer than supported as untested', async () => {
      setupMocks({
        dependencies: {'@sanity/ui': '^5.0.0'},
        localVersions: {'@sanity/ui': '5.0.0'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.error).not.toHaveBeenCalled()
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'The following package versions have not yet been marked as supported:',
        ),
      )
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining('@sanity/ui (installed: 5.0.0, want: ^2 || ^3 || ^4)'),
      )
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining('To downgrade, run either:'),
      )
    })

    test('should handle styled-components package correctly', async () => {
      setupMocks({
        dependencies: {'styled-components': '^6.1.15'},
        localVersions: {'styled-components': '6.1.15'},
      })

      await checkStudioDependencyVersions(workDir, mockOutput)

      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })
  })
})
