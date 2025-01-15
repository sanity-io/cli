import {createWriteStream} from 'node:fs'
import {basename, join as joinPath} from 'node:path'
import {pipeline} from 'node:stream/promises'

import {getIt} from 'get-it'
import {keepAlive, promise} from 'get-it/middleware'

import debug from './debug.js'
import withRetry from './withRetry.js'

const CONNECTION_TIMEOUT = 15 * 1000 // 15 seconds
const READ_TIMEOUT = 3 * 60 * 1000 // 3 minutes

const request = getIt([keepAlive(), promise()])

async function downloadAsset(
  url: string,
  fileName: string,
  fileType: string,
  outDir: string,
): Promise<void> {
  // File names that contain a path to file (e.g. sanity-storage/assets/file-name.tar.gz) fail when archive is
  // created due to missing parent dir (e.g. sanity-storage/assets), so we want to handle them by taking
  // the base name as file name.
  const normalizedFileName = basename(fileName)

  const assetFilePath = getAssetFilePath(normalizedFileName, fileType, outDir)
  await withRetry(async () => {
    const response = await request({
      url: url,
      maxRedirects: 5,
      timeout: {connect: CONNECTION_TIMEOUT, socket: READ_TIMEOUT},
      stream: true,
    })

    debug('Received asset %s with status code %d', normalizedFileName, response?.statusCode)

    await pipeline(response.body, createWriteStream(assetFilePath))
  })
}

function getAssetFilePath(fileName: string, fileType: string, outDir: string): string {
  // Set assetFilePath if we are downloading an asset file.
  // If it's a JSON document, assetFilePath will be an empty string.
  let assetFilePath = ''
  if (fileType === 'image') {
    assetFilePath = joinPath(outDir, 'images', fileName)
  } else if (fileType === 'file') {
    assetFilePath = joinPath(outDir, 'files', fileName)
  }

  return assetFilePath
}

export default downloadAsset
