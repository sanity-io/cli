import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {afterAll, beforeAll, describe, expect, test} from 'vitest'

import {readImageFile} from '../readImageFile.js'

let dir: string

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'image-file-'))
})

afterAll(async () => {
  await rm(dir, {force: true, recursive: true})
})

describe('readImageFile', () => {
  test.each([
    ['image.png', 'image/png'],
    ['image.JPG', 'image/jpeg'],
    ['image.svg', 'image/svg+xml'],
    ['image.heic', 'image/heic'],
  ])('reads %s with the %s content type', async (fileName, contentType) => {
    const filePath = path.join(dir, fileName)
    await writeFile(filePath, 'image bytes')

    const file = await readImageFile(filePath)

    expect(file).toEqual({contentType, image: Buffer.from('image bytes')})
  })

  test('rejects a file type that is not a supported image', async () => {
    await expect(readImageFile('./image.psd')).rejects.toThrow(
      '"./image.psd" isn\'t a supported image type. Use a PNG, JPEG, GIF, WebP, SVG, BMP, TIFF, HEIF or AVIF file.',
    )
  })

  test('rejects a file that does not exist', async () => {
    const filePath = path.join(dir, 'missing.png')

    await expect(readImageFile(filePath)).rejects.toThrow(
      `Couldn't find "${filePath}". Check the path and try again.`,
    )
  })

  test('accepts a file of exactly 5 MB and rejects one byte more', async () => {
    const atLimit = path.join(dir, 'at-limit.png')
    const overLimit = path.join(dir, 'over-limit.png')
    await writeFile(atLimit, Buffer.alloc(5 * 1024 * 1024))
    await writeFile(overLimit, Buffer.alloc(5 * 1024 * 1024 + 1))

    await expect(readImageFile(atLimit)).resolves.toMatchObject({contentType: 'image/png'})
    await expect(readImageFile(overLimit)).rejects.toThrow(
      `"${overLimit}" is larger than 5 MB, the upload limit. Use a smaller image.`,
    )
  })
})
