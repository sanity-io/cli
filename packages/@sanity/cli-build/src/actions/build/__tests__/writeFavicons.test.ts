import {join} from 'node:path'

import {convertToSystemPath} from '@sanity/cli-test/paths'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {getDefaultFaviconsPath, writeFavicons} from '../writeFavicons'

vi.mock('empathic/package', () => ({
  up: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  default: {
    copyFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../../util/copyDir.js', () => ({
  copyDir: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../writeWebManifest.js', () => ({
  writeWebManifest: vi.fn().mockResolvedValue(undefined),
}))

const mockPackagePath = convertToSystemPath('/mock/path/to/sanity/cli-build')

describe('#getDefaultFaviconsPath', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
  })

  test('should return a path to static/favicons', async () => {
    const {up} = await import('empathic/package')
    vi.mocked(up).mockReturnValue(join(mockPackagePath, 'package.json'))

    const path = await getDefaultFaviconsPath()
    expect(path).toEqual(join(mockPackagePath, 'static', 'favicons'))
  })

  test('should throw error when @sanity/cli-build package path cannot be resolved', async () => {
    const {up} = await import('empathic/package')
    vi.mocked(up).mockReturnValue(undefined)

    await expect(getDefaultFaviconsPath()).rejects.toThrow(
      'Unable to resolve `@sanity/cli-build` module root',
    )
  })
})

describe('#writeFavicons', () => {
  beforeEach(async () => {
    vi.clearAllMocks()

    const {up} = await import('empathic/package')
    vi.mocked(up).mockReturnValue(join(mockPackagePath, 'package.json'))
  })

  test('creates the destination directory, copies favicons, writes the manifest, and copies favicon.ico to the parent dir', async () => {
    const destDir = convertToSystemPath('/tmp/dest/static')
    const basePath = '/'

    const fs = (await import('node:fs/promises')).default
    const {copyDir} = await import('../../../util/copyDir.js')
    const {writeWebManifest} = await import('../writeWebManifest.js')

    await writeFavicons(basePath, destDir)

    expect(fs.mkdir).toHaveBeenCalledWith(destDir, {recursive: true})
    expect(copyDir).toHaveBeenCalledWith(join(mockPackagePath, 'static', 'favicons'), destDir, true)
    expect(writeWebManifest).toHaveBeenCalledWith(basePath, destDir)
    expect(fs.copyFile).toHaveBeenCalledWith(
      join(destDir, 'favicon.ico'),
      join(destDir, '..', 'favicon.ico'),
    )
  })
})
