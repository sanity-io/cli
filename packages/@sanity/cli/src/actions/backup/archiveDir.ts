import {createWriteStream} from 'node:fs'
import {createGzip} from 'node:zlib'

import {pack} from 'tar-fs'

import {backupDownloadDebug} from './backupDownloadDebug.js'

// ProgressCb is a callback that is called with the number of bytes processed so far.
type ProgressCb = (processedBytes: number) => void

/**
 * Creates a compressed tarball of the given directory and writes it to the specified file path
 *
 * @param tmpOutDir - The directory to archive
 * @param outFilePath - The output file path for the compressed tarball
 * @param progressCb - Callback function called with the number of bytes processed
 */
export function archiveDir(
  tmpOutDir: string,
  outFilePath: string,
  progressCb: ProgressCb,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const archiveDestination = createWriteStream(outFilePath)
    const gzipStream = createGzip()
    let processedBytes = 0

    archiveDestination.on('error', (err: Error) => {
      backupDownloadDebug('Archive destination error: %s', err.message)
      reject(err)
    })

    archiveDestination.on('close', () => {
      backupDownloadDebug('Archive completed successfully')
      resolve()
    })

    gzipStream.on('error', (err: Error) => {
      backupDownloadDebug('Gzip stream error: %s', err.message)
      reject(err)
    })

    const tarStream = pack(tmpOutDir)

    tarStream.on('error', (err: Error) => {
      backupDownloadDebug('Tar stream error: %s', err.message)
      reject(err)
    })

    // Track progress by listening to data events
    tarStream.on('data', (chunk: Buffer) => {
      processedBytes += chunk.length
      progressCb(processedBytes)
    })

    // Pipe tar -> gzip -> file
    tarStream.pipe(gzipStream).pipe(archiveDestination)
  })
}
