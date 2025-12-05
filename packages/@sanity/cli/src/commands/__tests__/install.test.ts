import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {
  installDeclaredPackages,
  installNewPackages,
} from '../../util/packageManager/installPackages.js'
import {getPackageManagerChoice} from '../../util/packageManager/packageManagerChoice.js'
import {Install} from '../install.js'

vi.mock('../../../../cli-core/src/config/findProjectRoot.js', async () => {
  return {
    findProjectRoot: vi.fn().mockResolvedValue({
      directory: '/test/project',
      root: '/test/project',
      type: 'studio',
    }),
  }
})

vi.mock('../../util/packageManager/packageManagerChoice.js', () => ({
  getPackageManagerChoice: vi.fn(),
}))

vi.mock('../../util/packageManager/installPackages.js', () => ({
  installDeclaredPackages: vi.fn(),
  installNewPackages: vi.fn(),
}))

const mockGetPackageManagerChoice = vi.mocked(getPackageManagerChoice)
const mockInstallDeclaredPackages = vi.mocked(installDeclaredPackages)
const mockInstallNewPackages = vi.mocked(installNewPackages)

afterEach(() => {
  vi.clearAllMocks()
})

describe('#install', () => {
  test('help text is correct', async () => {
    const {stdout} = await runCommand('install --help')
    expect(stdout).toMatchInlineSnapshot(`
      "Installs dependencies for Sanity Studio project

      USAGE
        $ sanity install [PACKAGES...]

      ARGUMENTS
        [PACKAGES...]  Packages to install

      DESCRIPTION
        Installs dependencies for Sanity Studio project

      EXAMPLES
        $ sanity install

        $ sanity install @sanity/vision

        $ sanity install some-package another-package

      "
    `)
  })

  describe('install declared packages (no arguments)', () => {
    test('installs declared packages with npm', async () => {
      mockGetPackageManagerChoice.mockResolvedValueOnce({
        chosen: 'npm',
        mostOptimal: 'npm',
      })
      mockInstallDeclaredPackages.mockResolvedValueOnce()

      const {error} = await testCommand(Install, [])

      expect(error).toBeUndefined()
      expect(mockGetPackageManagerChoice).toHaveBeenCalledWith('/test/project', {
        interactive: true,
      })
      expect(mockInstallDeclaredPackages).toHaveBeenCalledWith(
        '/test/project',
        'npm',
        expect.objectContaining({
          workDir: '/test/project',
        }),
      )
      expect(mockInstallNewPackages).not.toHaveBeenCalled()
    })

    test('installs declared packages with yarn', async () => {
      mockGetPackageManagerChoice.mockResolvedValueOnce({
        chosen: 'yarn',
        mostOptimal: 'yarn',
      })
      mockInstallDeclaredPackages.mockResolvedValueOnce()

      const {error} = await testCommand(Install, [])

      expect(error).toBeUndefined()
      expect(mockInstallDeclaredPackages).toHaveBeenCalledWith(
        '/test/project',
        'yarn',
        expect.objectContaining({
          workDir: '/test/project',
        }),
      )
    })

    test('installs declared packages with pnpm', async () => {
      mockGetPackageManagerChoice.mockResolvedValueOnce({
        chosen: 'pnpm',
        mostOptimal: 'pnpm',
      })
      mockInstallDeclaredPackages.mockResolvedValueOnce()

      const {error} = await testCommand(Install, [])

      expect(error).toBeUndefined()
      expect(mockInstallDeclaredPackages).toHaveBeenCalledWith(
        '/test/project',
        'pnpm',
        expect.objectContaining({
          workDir: '/test/project',
        }),
      )
    })

    test('installs declared packages with bun', async () => {
      mockGetPackageManagerChoice.mockResolvedValueOnce({
        chosen: 'bun',
        mostOptimal: 'bun',
      })
      mockInstallDeclaredPackages.mockResolvedValueOnce()

      const {error} = await testCommand(Install, [])

      expect(error).toBeUndefined()
      expect(mockInstallDeclaredPackages).toHaveBeenCalledWith(
        '/test/project',
        'bun',
        expect.objectContaining({
          workDir: '/test/project',
        }),
      )
    })

    test('handles manual package manager selection', async () => {
      mockGetPackageManagerChoice.mockResolvedValueOnce({
        chosen: 'manual',
        mostOptimal: 'npm',
      })
      mockInstallDeclaredPackages.mockResolvedValueOnce()

      const {error} = await testCommand(Install, [])

      expect(error).toBeUndefined()
      expect(mockInstallDeclaredPackages).toHaveBeenCalledWith(
        '/test/project',
        'manual',
        expect.objectContaining({
          workDir: '/test/project',
        }),
      )
    })
  })

  describe('install specific packages (with arguments)', () => {
    test('installs single package', async () => {
      mockGetPackageManagerChoice.mockResolvedValueOnce({
        chosen: 'npm',
        mostOptimal: 'npm',
      })
      mockInstallNewPackages.mockResolvedValueOnce()

      const {error} = await testCommand(Install, ['@sanity/vision'])

      expect(error).toBeUndefined()
      expect(mockInstallNewPackages).toHaveBeenCalledWith(
        {
          packageManager: 'npm',
          packages: ['@sanity/vision'],
        },
        expect.objectContaining({
          workDir: '/test/project',
        }),
      )
      expect(mockInstallDeclaredPackages).not.toHaveBeenCalled()
    })

    test('installs multiple packages', async () => {
      mockGetPackageManagerChoice.mockResolvedValueOnce({
        chosen: 'yarn',
        mostOptimal: 'yarn',
      })
      mockInstallNewPackages.mockResolvedValueOnce()

      const {error} = await testCommand(Install, ['@sanity/vision', 'react-icons', 'lodash'])

      expect(error).toBeUndefined()
      expect(mockInstallNewPackages).toHaveBeenCalledWith(
        {
          packageManager: 'yarn',
          packages: ['@sanity/vision', 'react-icons', 'lodash'],
        },
        expect.objectContaining({
          workDir: '/test/project',
        }),
      )
      expect(mockInstallDeclaredPackages).not.toHaveBeenCalled()
    })

    test('installs packages with different package managers', async () => {
      mockGetPackageManagerChoice.mockResolvedValueOnce({
        chosen: 'pnpm',
        mostOptimal: 'pnpm',
      })
      mockInstallNewPackages.mockResolvedValueOnce()

      const {error} = await testCommand(Install, ['some-package'])

      expect(error).toBeUndefined()
      expect(mockInstallNewPackages).toHaveBeenCalledWith(
        {
          packageManager: 'pnpm',
          packages: ['some-package'],
        },
        expect.objectContaining({
          workDir: '/test/project',
        }),
      )
    })
  })

  describe('error handling', () => {
    test('handles package manager choice failure', async () => {
      mockGetPackageManagerChoice.mockRejectedValueOnce(
        new Error('Failed to detect package manager'),
      )

      const {error} = await testCommand(Install, [])

      expect(error).toBeDefined()
      expect(error?.message).toContain('Failed to detect package manager')
      expect(mockInstallDeclaredPackages).not.toHaveBeenCalled()
      expect(mockInstallNewPackages).not.toHaveBeenCalled()
    })

    test('handles declared packages installation failure', async () => {
      mockGetPackageManagerChoice.mockResolvedValueOnce({
        chosen: 'npm',
        mostOptimal: 'npm',
      })
      mockInstallDeclaredPackages.mockRejectedValueOnce(new Error('Installation failed'))

      const {error} = await testCommand(Install, [])

      expect(error).toBeDefined()
      expect(error?.message).toContain('Installation failed')
    })

    test('handles new packages installation failure', async () => {
      mockGetPackageManagerChoice.mockResolvedValueOnce({
        chosen: 'npm',
        mostOptimal: 'npm',
      })
      mockInstallNewPackages.mockRejectedValueOnce(new Error('Package not found'))

      const {error} = await testCommand(Install, ['nonexistent-package'])

      expect(error).toBeDefined()
      expect(error?.message).toContain('Package not found')
    })
  })

  describe('integration with project root', () => {
    test('passes correct working directory to functions', async () => {
      mockGetPackageManagerChoice.mockResolvedValueOnce({
        chosen: 'npm',
        mostOptimal: 'npm',
      })
      mockInstallDeclaredPackages.mockResolvedValueOnce()

      await testCommand(Install, [])

      expect(mockGetPackageManagerChoice).toHaveBeenCalledWith('/test/project', {
        interactive: true,
      })
      expect(mockInstallDeclaredPackages).toHaveBeenCalledWith(
        '/test/project',
        'npm',
        expect.objectContaining({
          workDir: '/test/project',
        }),
      )
    })

    test('provides output object to install functions', async () => {
      mockGetPackageManagerChoice.mockResolvedValueOnce({
        chosen: 'npm',
        mostOptimal: 'npm',
      })
      mockInstallNewPackages.mockResolvedValueOnce()

      await testCommand(Install, ['test-package'])

      expect(mockInstallNewPackages).toHaveBeenCalledWith(
        {
          packageManager: 'npm',
          packages: ['test-package'],
        },
        expect.objectContaining({
          output: expect.objectContaining({
            error: expect.any(Function),
            log: expect.any(Function),
            warn: expect.any(Function),
          }),
          workDir: '/test/project',
        }),
      )
    })
  })
})
