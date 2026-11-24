import {type Stats} from 'node:fs'
import {readFile, stat} from 'node:fs/promises'
import {extname} from 'node:path'

// The image formats Sanity accepts for uploaded images, such as organization logos. Uploads need
// an image Content-Type, and the CLI has no other source for one.
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.webp': 'image/webp',
}

// Matches the upload limit, so a large file fails here instead of after uploading it.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** @public */
export interface ImageFile {
  contentType: string
  image: Buffer
}

/**
 * Read an image file to upload, such as an organization's logo. Throws an error a user can act on
 * when the file is missing, isn't a supported image type, or is over 5 MB.
 * @public
 */
export async function readImageFile(filePath: string): Promise<ImageFile> {
  const contentType = IMAGE_CONTENT_TYPES[extname(filePath).toLowerCase()]
  if (!contentType) {
    throw new Error(
      `"${filePath}" isn't a supported image type. Use a PNG, JPEG, GIF, WebP, SVG, BMP, TIFF, HEIF or AVIF file.`,
    )
  }

  let stats: Stats
  try {
    stats = await stat(filePath)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Couldn't find "${filePath}". Check the path and try again.`, {cause: error})
    }
    throw error
  }

  if (stats.size > MAX_IMAGE_BYTES) {
    throw new Error(`"${filePath}" is larger than 5 MB, the upload limit. Use a smaller image.`)
  }

  return {contentType, image: await readFile(filePath)}
}
