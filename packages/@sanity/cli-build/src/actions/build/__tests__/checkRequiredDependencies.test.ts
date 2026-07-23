import {
  getLocalPackageVersion as mockGetLocalPackageVersion,
  readPackageJson as mockReadPackageJson,
} from '@sanity/cli-test/mocks/cli-core/package-manager'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
  checkRequiredDependencies,
  CheckRequiredDependenciesOptions,
} from '../checkRequiredDependencies'

vi.mock('semver', {spy: true})

vi.mock(
  '@sanity/cli-core/package-manager',
  () => import('@sanity/cli-test/mocks/cli-core/package-manager'),
)

const handler = ({message}: {message: string}) => {
  throw new Error(`Unhandled event: ${message}`)
}

function buildOptions(
  isApp: boolean,
  overrides?: Partial<CheckRequiredDependenciesOptions>,
): CheckRequiredDependenciesOptions {
  return {
    isApp,
    onIncompatibleDeclaredStyledComponentsVersionRange: handler,
    onIncompatibleInstalledStyledComponentsVersionRange: handler,
    onInvalidStyledComponentsVersionRange: handler,
    onNoDeclaredStyledComponentsVersion: handler,
    onNoInstalledSanityVersion: handler,
    onNoInstalledStyledComponentsVersion: handler,
    workDir: '/tmp/test-studio',

    ...overrides,
  }
}

describe('#checkRequiredDependencies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('should return early if the project is an app', async () => {
    const result = await checkRequiredDependencies(buildOptions(true))
    expect(result).toEqual({installedSanityVersion: ''})
    expect(mockReadPackageJson).not.toHaveBeenCalled()
  })

  test('should call output.error and return empty string if sanity is not installed', async () => {
    mockReadPackageJson.mockResolvedValue({
      dependencies: {},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockGetLocalPackageVersion.mockImplementation(async (module: string) => {
      if (module === 'sanity') {
        return null
      }
      return '6.1.15'
    })

    const mockNoInstalledSanityVersion = vi.fn()
    const result = await checkRequiredDependencies(
      buildOptions(false, {onNoInstalledSanityVersion: mockNoInstalledSanityVersion}),
    )

    expect(mockNoInstalledSanityVersion).toHaveBeenCalledWith({
      message: 'Failed to read the installed sanity version.',
    })
    expect(result).toEqual({installedSanityVersion: ''})
  })

  test('should call output.error and return sanity version if styled-components is not declared', async () => {
    mockReadPackageJson.mockResolvedValue({
      dependencies: {},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockGetLocalPackageVersion.mockImplementation(async (module: string) => {
      if (module === 'sanity') {
        return '3.0.0'
      }
      return null // styled-components not installed
    })

    const mockNoDeclaredStyledComponentsVersion = vi.fn()
    const result = await checkRequiredDependencies(
      buildOptions(false, {
        onNoDeclaredStyledComponentsVersion: mockNoDeclaredStyledComponentsVersion,
      }),
    )

    expect(mockNoDeclaredStyledComponentsVersion).toHaveBeenCalledWith({
      message: expect.stringContaining('Declared dependency `styled-components` is not installed'),
    })
    expect(result).toEqual({installedSanityVersion: '3.0.0'})
  })

  test('should call output.error and return sanity version for invalid styled-components version range', async () => {
    mockReadPackageJson.mockResolvedValue({
      dependencies: {'styled-components': 'some-invalid-range'},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockGetLocalPackageVersion.mockResolvedValue('3.0.0') // for sanity

    const mockInvalidStyledComponentsVersionRange = vi.fn()
    const result = await checkRequiredDependencies(
      buildOptions(false, {
        onInvalidStyledComponentsVersionRange: mockInvalidStyledComponentsVersionRange,
      }),
    )

    expect(mockInvalidStyledComponentsVersionRange).toHaveBeenCalledWith({
      message: expect.stringContaining(
        'Declared dependency `styled-components` has an invalid version range: `some-invalid-range`',
      ),
    })
    expect(result).toEqual({installedSanityVersion: '3.0.0'})
  })

  test('should warn on incompatible declared styled-components version', async () => {
    mockReadPackageJson.mockResolvedValue({
      dependencies: {'styled-components': '^5.0.0'},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockGetLocalPackageVersion.mockResolvedValue('6.1.15')

    const onIncompatibleDeclaredStyledComponentsVersionRange = vi.fn()
    await checkRequiredDependencies(
      buildOptions(false, {onIncompatibleDeclaredStyledComponentsVersionRange}),
    )

    expect(onIncompatibleDeclaredStyledComponentsVersionRange).toHaveBeenCalledWith({
      message: expect.stringContaining(
        'Declared version of styled-components (^5.0.0) is not compatible with the version required by sanity (^6.1.15)',
      ),
    })
  })

  test('should not warn on complex but valid styled-components version range', async () => {
    mockReadPackageJson.mockResolvedValue({
      dependencies: {'styled-components': '>=6.0.0 <7.0.0'},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockGetLocalPackageVersion.mockResolvedValue('6.1.15')

    const onIncompatibleDeclaredStyledComponentsVersionRange = vi.fn()
    await checkRequiredDependencies(
      buildOptions(false, {onIncompatibleDeclaredStyledComponentsVersionRange}),
    )

    expect(onIncompatibleDeclaredStyledComponentsVersionRange).not.toHaveBeenCalled()
  })

  test('should call output.error and return sanity version if styled-components is declared but not installed', async () => {
    mockReadPackageJson.mockResolvedValue({
      dependencies: {'styled-components': '^6.1.15'},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockGetLocalPackageVersion.mockImplementation(async (module: string) => {
      if (module === 'styled-components') {
        return null
      }
      return '3.0.0' // sanity version
    })

    const onNoInstalledStyledComponentsVersion = vi.fn()
    const result = await checkRequiredDependencies(
      buildOptions(false, {onNoInstalledStyledComponentsVersion}),
    )

    expect(onNoInstalledStyledComponentsVersion).toHaveBeenCalledWith({
      message: expect.stringContaining('Declared dependency `styled-components` is not installed'),
    })
    expect(result).toEqual({installedSanityVersion: '3.0.0'})
  })

  test('should warn on incompatible installed styled-components version', async () => {
    mockReadPackageJson.mockResolvedValue({
      dependencies: {'styled-components': '^6.1.15'},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockGetLocalPackageVersion.mockImplementation(async (module: string) => {
      if (module === 'styled-components') {
        return '5.3.6'
      }
      return '3.0.0' // sanity version
    })

    const onIncompatibleInstalledStyledComponentsVersionRange = vi.fn()
    await checkRequiredDependencies(
      buildOptions(false, {onIncompatibleInstalledStyledComponentsVersionRange}),
    )

    expect(onIncompatibleInstalledStyledComponentsVersionRange).toHaveBeenCalledWith({
      message: expect.stringContaining(
        'Installed version of styled-components (5.3.6) is not compatible with the version required by sanity (^6.1.15)',
      ),
    })
  })

  test('should not error on catalog: prefix for styled-components version', async () => {
    mockReadPackageJson.mockResolvedValue({
      dependencies: {'styled-components': 'catalog:'},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockGetLocalPackageVersion.mockImplementation(async (module: string) => {
      if (module === 'sanity') return '3.2.0'
      if (module === 'styled-components') return '6.1.15'
      return null
    })

    const result = await checkRequiredDependencies(buildOptions(false))

    expect(result).toEqual({installedSanityVersion: '3.2.0'})
  })

  test('should not warn on version comparison when using catalog: prefix', async () => {
    mockReadPackageJson.mockResolvedValue({
      dependencies: {'styled-components': 'catalog:react'},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockGetLocalPackageVersion.mockImplementation(async (module: string) => {
      if (module === 'sanity') return '3.2.0'
      if (module === 'styled-components') return '6.1.15'
      return null
    })

    const result = await checkRequiredDependencies(buildOptions(false))

    expect(result).toEqual({installedSanityVersion: '3.2.0'})
  })

  test('should still warn on incompatible installed version when using catalog: prefix', async () => {
    mockReadPackageJson.mockResolvedValue({
      dependencies: {'styled-components': 'catalog:'},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })
    mockGetLocalPackageVersion.mockImplementation(async (module: string) => {
      if (module === 'sanity') return '3.2.0'
      if (module === 'styled-components') return '5.3.6'
      return null
    })

    const onIncompatibleInstalledStyledComponentsVersionRange = vi.fn()
    await checkRequiredDependencies(
      buildOptions(false, {onIncompatibleInstalledStyledComponentsVersionRange}),
    )

    expect(onIncompatibleInstalledStyledComponentsVersionRange).toHaveBeenCalledWith({
      message: expect.stringContaining(
        'Installed version of styled-components (5.3.6) is not compatible with the version required by sanity (^6.1.15)',
      ),
    })
  })

  test('should succeed on happy path', async () => {
    mockReadPackageJson.mockResolvedValue({
      dependencies: {'styled-components': '^6.1.15'},
      devDependencies: {},
      name: 'test-studio',
      version: '1.0.0',
    })

    mockGetLocalPackageVersion.mockImplementation(async (module: string) => {
      if (module === 'sanity') return '3.2.0'
      if (module === 'styled-components') return '6.1.15'
      return null
    })

    const result = await checkRequiredDependencies(buildOptions(false))

    expect(result).toEqual({installedSanityVersion: '3.2.0'})
  })
})
