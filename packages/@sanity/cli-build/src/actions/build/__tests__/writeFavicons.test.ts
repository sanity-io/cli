import {describe, expect, test, vi} from 'vitest'
import {getDefaultFaviconsPath} from '../writeFavicons'

vi.mock('read-package-up', () => ({
  readPackageUp: vi.fn(),
}))

describe('#getDefaultFaviconsPath', () => {
  test('should throw error when @sanity/cli-build package path cannot be resolved', async () => {
    const {readPackageUp} = await import('read-package-up')
    vi.mocked(readPackageUp).mockResolvedValue(undefined)

    await expect(getDefaultFaviconsPath()).rejects.toThrow(
      'Unable to resolve `@sanity/cli-build` module root',
    )
  })
})
