import {join} from 'node:path'

import {convertToSystemPath} from '@sanity/cli-test'
import {describe, expect, test, vi} from 'vitest'
import {getDefaultFaviconsPath} from '../writeFavicons'

vi.mock('read-package-up', () => ({
  readPackageUp: vi.fn(),
}))

const mockPackagePath = convertToSystemPath('/mock/path/to/sanity/cli-build')

describe('#getDefaultFaviconsPath', () => {
  test('should return a path to static/favicons', async () => {
    const {readPackageUp} = await import('read-package-up')
    vi.mocked(readPackageUp).mockResolvedValue({
      packageJson: {name: 'sanity'},
      path: join(mockPackagePath, 'package.json'),
    })

    const path = await getDefaultFaviconsPath()
    expect(path).toEqual(join(mockPackagePath, 'static', 'favicons'))
  })

  test('should throw error when @sanity/cli-build package path cannot be resolved', async () => {
    const {readPackageUp} = await import('read-package-up')
    vi.mocked(readPackageUp).mockResolvedValue(undefined)

    await expect(getDefaultFaviconsPath()).rejects.toThrow(
      'Unable to resolve `@sanity/cli-build` module root',
    )
  })
})
