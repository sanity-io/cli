import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {afterAll, beforeAll, describe, expect, test} from 'vitest'

import {readOrganizationLogo} from '../readOrganizationLogo.js'

let dir: string

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'org-logo-'))
})

afterAll(async () => {
  await rm(dir, {force: true, recursive: true})
})

describe('readOrganizationLogo', () => {
  test.each([
    ['logo.png', 'image/png'],
    ['logo.JPG', 'image/jpeg'],
    ['logo.svg', 'image/svg+xml'],
    ['logo.heic', 'image/heic'],
  ])('reads %s with the %s content type', async (fileName, contentType) => {
    const filePath = path.join(dir, fileName)
    await writeFile(filePath, 'image bytes')

    const logo = await readOrganizationLogo(filePath)

    expect(logo).toEqual({contentType, image: Buffer.from('image bytes')})
  })

  test('rejects a file type that is not a supported image', async () => {
    await expect(readOrganizationLogo('./logo.psd')).rejects.toThrow(
      '"./logo.psd" isn\'t a supported image type. Use a PNG, JPEG, GIF, WebP, SVG, BMP, TIFF, HEIF or AVIF file.',
    )
  })

  test('rejects a file that does not exist', async () => {
    const filePath = path.join(dir, 'missing.png')

    await expect(readOrganizationLogo(filePath)).rejects.toThrow(
      `Couldn't find "${filePath}". Check the path and try again.`,
    )
  })

  test('accepts a file of exactly 5 MB and rejects one byte more', async () => {
    const atLimit = path.join(dir, 'at-limit.png')
    const overLimit = path.join(dir, 'over-limit.png')
    await writeFile(atLimit, Buffer.alloc(5 * 1024 * 1024))
    await writeFile(overLimit, Buffer.alloc(5 * 1024 * 1024 + 1))

    await expect(readOrganizationLogo(atLimit)).resolves.toMatchObject({contentType: 'image/png'})
    await expect(readOrganizationLogo(overLimit)).rejects.toThrow(
      `"${overLimit}" is larger than 5 MB, the limit for a logo. Use a smaller image.`,
    )
  })
})
