import {createRequester, retry} from '@sanity/cli-core/request'

import {backupDownloadDebug} from './backupDownloadDebug.js'

const READ_TIMEOUT = 3 * 60 * 1000 // 3 minutes

const request = createRequester({
  as: 'text',
  middleware: [retry()],
})

/**
 * Downloads a document from a backup URL
 *
 * @param url - The URL to download the document from
 * @returns The document content as received from the API
 */
export async function downloadDocument(url: string): Promise<string> {
  const response = await request({
    timeout: READ_TIMEOUT,
    url,
  })

  backupDownloadDebug('Received document from %s with status code %d', url, response.status)

  return response.body
}
