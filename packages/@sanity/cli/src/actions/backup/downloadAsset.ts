import {createWriteStream} from 'node:fs'
import path from 'node:path'
import {pipeline} from 'node:stream/promises'

import {getIt} from 'get-it'
import {httpErrors, keepAlive, promise, retry} from 'get-it/middleware'

import {backupDownloadDebug} from './backupDownloadDebug.js'

const CONNECTION_TIMEOUT = 15 * 1000 // 15 seconds
const READ_TIMEOUT = 3 * 60 * 1000 // 3 minutes

const request = getIt([keepAlive(), httpErrors(), retry(), promise()])

/**
 * Downloads an asset (image or file) from a backup to the specified output directory
 *
 * @param url - The URL to download the asset from
 * @param fileName - The original file name of the asset
 * @param fileType - The type of asset ('image' or 'file')
 * @param outDir - The output directory to save the asset to
 */
export async function downloadAsset(
  url: string,
  fileName: string,
  fileType: string,
  outDir: string,
): Promise<void> {
  // File names that contain a path to file (e.g. sanity-storage/assets/file-name.tar.gz) fail when archive is
  // created due to missing parent dir (e.g. sanity-storage/assets), so we want to handle them by taking
  // the base name as file name.
  const normalizedFileName = path.basename(fileName)

  const assetFilePath = getAssetFilePath(normalizedFileName, fileType, outDir)

  const response = await request({
    maxRedirects: 5,
    stream: true,
    timeout: {connect: CONNECTION_TIMEOUT, socket: READ_TIMEOUT},
    url,
  })

  backupDownloadDebug(
    'Received asset %s with status code %d',
    normalizedFileName,
    response?.statusCode,
  )

  await pipeline(response.body, createWriteStream(assetFilePath))
}

function getAssetFilePath(fileName: string, fileType: string, outDir: string): string {
  // Set assetFilePath if we are downloading an asset file.
  // If it's a JSON document, assetFilePath will be an empty string.
  let assetFilePath = ''
  if (fileType === 'image') {
    assetFilePath = path.join(outDir, 'images', fileName)
  } else if (fileType === 'file') {
    assetFilePath = path.join(outDir, 'files', fileName)
  }

  return assetFilePath
}
