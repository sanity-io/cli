import {afterEach, describe, expect, test, vi} from 'vitest'

import {
  type InstalledPackage,
  type PackageDeclaration,
} from '../../packageManager/installationInfo/types.js'
import {resolveUpdateTarget} from '../resolveUpdateTarget.js'

const mockFindInstalledPackage = vi.hoisted(() => vi.fn())
const mockFindPackageDeclaration = vi.hoisted(() => vi.fn())

vi.mock('../../packageManager/installationInfo/detectPackages.js', () => ({
  findInstalledPackage: mockFindInstalledPackage,
  findPackageDeclaration: mockFindPackageDeclaration,
}))

describe('resolveUpdateTarget', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns sanity when sanity is declared and installed', async () => {
    const declaration: PackageDeclaration = {
      declaredVersionRange: '^5.4.0',
      dependencyType: 'dependencies',
      packageJsonPath: '/fake/project/package.json',
      versionRange: '^5.4.0',
    }
    const installed: InstalledPackage = {
      cliDependencyRange: '5.4.0',
      path: '/fake/project/node_modules/.pnpm/sanity@5.4.0/node_modules/sanity',
      version: '5.4.0',
    }

    mockFindPackageDeclaration.mockResolvedValue(declaration)
    mockFindInstalledPackage.mockResolvedValue(installed)

    const result = await resolveUpdateTarget('/fake/project', '6.3.1')

    expect(result.packageName).toBe('sanity')
    expect(result.installedVersion).toBe('5.4.0')
    expect(mockFindPackageDeclaration).toHaveBeenCalledWith('sanity', '/fake/project')
    expect(mockFindInstalledPackage).toHaveBeenCalledWith('sanity', '/fake/project')
  })

  test('falls back to @sanity/cli when sanity is declared but not installed', async () => {
    const declaration: PackageDeclaration = {
      declaredVersionRange: '^3.67.0',
      dependencyType: 'dependencies',
      packageJsonPath: '/fake/project/package.json',
      versionRange: '^3.67.0',
    }

    mockFindPackageDeclaration.mockResolvedValue(declaration)
    mockFindInstalledPackage.mockResolvedValue(null)

    const result = await resolveUpdateTarget('/fake/project', '6.3.1')

    expect(result.packageName).toBe('@sanity/cli')
    expect(result.installedVersion).toBe('6.3.1')
    expect(mockFindPackageDeclaration).toHaveBeenCalledWith('sanity', '/fake/project')
    expect(mockFindInstalledPackage).toHaveBeenCalledWith('sanity', '/fake/project')
  })

  test('falls back to @sanity/cli when sanity is not declared', async () => {
    mockFindPackageDeclaration.mockResolvedValue(null)

    const result = await resolveUpdateTarget('/fake/project', '6.3.1')

    expect(result.packageName).toBe('@sanity/cli')
    expect(result.installedVersion).toBe('6.3.1')
    expect(mockFindPackageDeclaration).toHaveBeenCalledWith('sanity', '/fake/project')
    // Should not attempt to find installed package when not declared
    expect(mockFindInstalledPackage).not.toHaveBeenCalled()
  })
})
