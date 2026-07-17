import {Transform, type TransformCallback, type Writable} from 'node:stream'
import {pipeline} from 'node:stream/promises'

import {createRequester, nodeReadableFromWeb, retry} from '@sanity/cli-core/request'

const CONNECTION_TIMEOUT = 15 * 1000 // 15 seconds
const READ_TIMEOUT = 3 * 60 * 1000 // 3 minutes

const request = createRequester({
  middleware: [retry()],
})

/**
 * Downloads a backup response into a Node.js writable stream.
 *
 * The connection timeout only covers receiving the response headers. Once
 * streaming starts, the read timeout is reset for every received chunk.
 *
 * @param url - Backup response URL
 * @param destination - Stream that receives the response body
 * @returns HTTP response status
 * @internal
 */
export async function downloadStream(url: string, destination: Writable): Promise<number> {
  const abortController = new AbortController()
  const connectionTimeout = setTimeout(() => {
    abortController.abort(
      new Error('Backup download timed out before receiving a response. Try again.'),
    )
  }, CONNECTION_TIMEOUT)
  connectionTimeout.unref()

  let response
  try {
    response = await request({
      as: 'stream',
      signal: abortController.signal,
      timeout: false,
      url,
    })
  } finally {
    clearTimeout(connectionTimeout)
  }

  let readTimeout: NodeJS.Timeout | undefined
  const resetReadTimeout = () => {
    if (readTimeout) clearTimeout(readTimeout)
    readTimeout = setTimeout(() => {
      const error = new Error('Backup download stalled: no data received for 3 minutes. Try again.')
      abortController.abort(error)
      timeoutStream.destroy(error)
    }, READ_TIMEOUT)
    readTimeout.unref()
  }
  const timeoutStream = new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      resetReadTimeout()
      callback(null, chunk)
    },
  })

  resetReadTimeout()
  try {
    await pipeline(nodeReadableFromWeb(response.body), timeoutStream, destination)
  } finally {
    if (readTimeout) clearTimeout(readTimeout)
  }

  return response.status
}
