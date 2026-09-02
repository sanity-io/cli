import {type FileHandle, open} from 'node:fs/promises'

import {type AssetType, uploadAsset} from '../../services/assets.js'
import {AssetFileError} from './assetFileError.js'

interface UploadAssetFromFileOptions {
  assetType: AssetType
  dataset: string
  filename: string
  filePath: string
  projectId: string

  contentType?: string
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

async function openAssetFile(
  filePath: string,
): Promise<{fileHandle: FileHandle; fileSize: number}> {
  let fileHandle: FileHandle | undefined

  try {
    fileHandle = await open(filePath, 'r')
    const fileStat = await fileHandle.stat()
    if (!fileStat.isFile()) throw new AssetFileError('not-file')

    return {fileHandle, fileSize: fileStat.size}
  } catch (error) {
    await fileHandle?.close()
    if (error instanceof AssetFileError) throw error
    throw new AssetFileError('unreadable')
  }
}

export async function uploadAssetFromFile(options: UploadAssetFromFileOptions) {
  options.signal?.throwIfAborted()
  const {filePath, ...uploadOptions} = options
  const {fileHandle, fileSize} = await openAssetFile(filePath)
  const fileStream = fileHandle.createReadStream({autoClose: false})

  try {
    options.signal?.throwIfAborted()
    return await uploadAsset({...uploadOptions, body: fileStream, fileSize})
  } finally {
    fileStream.destroy()
    await fileHandle.close()
  }
}
