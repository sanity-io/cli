import {packageDirectory} from 'package-directory'
import {describe, expect, test, vi} from 'vitest'

import {getCliVersion} from '../getCliVersion.js'
import {type PackageJson, readPackageJson} from '../readPackageJson.js'

vi.mock('package-directory')
vi.mock(import('../readPackageJson.js'))

describe('#getCliVersion', () => {
  test('should return the version of the @sanity/cli package', async () => {
    vi.mocked(packageDirectory).mockResolvedValueOnce('/test/path')
    // @ts-expect-error - vitest mock typing doesn't handle function overloads correctly
    vi.mocked(readPackageJson).mockResolvedValueOnce({
      name: '@sanity/cli',
      version: '1.0.0',
    } as PackageJson)

    const version = await getCliVersion()

    expect(version).toBe('1.0.0')
  })

  test('should throw an error if the package.json is not found', async () => {
    vi.mocked(packageDirectory).mockResolvedValueOnce('/test/path')
    vi.mocked(readPackageJson).mockRejectedValueOnce(new Error('Package.json not found'))

    await expect(getCliVersion()).rejects.toThrow('Package.json not found')
  })

  test('should throw an error if cli path is not found', async () => {
    vi.mocked(packageDirectory).mockResolvedValueOnce(undefined)

    await expect(getCliVersion()).rejects.toThrow('Unable to resolve root of @sanity/cli module')
  })
})
