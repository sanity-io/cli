import {createRequester, keepAlive, retry} from '@sanity/cli-core/request'

import {backupDownloadDebug} from './backupDownloadDebug.js'

const CONNECTION_TIMEOUT = 15 * 1000 // 15 seconds
const READ_TIMEOUT = 3 * 60 * 1000 // 3 minutes

const request = createRequester({middleware: {promise: {onlyBody: false}}})
  .use(keepAlive())
  .use(retry())

/**
 * Downloads a document from a backup URL
 *
 * @param url - The URL to download the document from
 * @returns The document content as received from the API
 */
export async function downloadDocument(url: string): Promise<unknown> {
  const response = await request({
    maxRedirects: 5,
    timeout: {connect: CONNECTION_TIMEOUT, socket: READ_TIMEOUT},
    url,
  })

  backupDownloadDebug('Received document from %s with status code %d', url, response?.statusCode)

  return response.body
}
