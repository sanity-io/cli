import {Writable} from 'node:stream'

import {backupDownloadDebug} from './backupDownloadDebug.js'
import {downloadStream} from './downloadStream.js'

/**
 * Downloads a document from a backup URL
 *
 * @param url - The URL to download the document from
 * @returns The document content as received from the API
 */
export async function downloadDocument(url: string): Promise<string> {
  const chunks: Buffer[] = []
  const status = await downloadStream(
    url,
    () =>
      new Writable({
        write(chunk: Buffer, _encoding, callback) {
          chunks.push(Buffer.from(chunk))
          callback()
        },
      }),
  )

  backupDownloadDebug('Received document from %s with status code %d', url, status)

  return Buffer.concat(chunks).toString()
}
