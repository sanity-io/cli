import {Transform, type TransformCallback, type Writable} from 'node:stream'
import {pipeline} from 'node:stream/promises'

import {
  createRequester,
  isTimeoutError,
  nodeReadableFromWeb,
  retry,
  type StreamResponse,
} from '@sanity/cli-core/request'

const CONNECTION_TIMEOUT = 15 * 1000 // 15 seconds
const READ_TIMEOUT = 3 * 60 * 1000 // 3 minutes

const request = createRequester({
  middleware: [retry()],
  // Fresh 15s headers deadline per retry attempt (TimeoutError is retried for
  // GET). No total deadline: the body phase is governed by the idle read
  // timeout below, which resets on every received chunk.
  timeout: {headers: CONNECTION_TIMEOUT, total: false},
})

/**
 * Downloads a backup response into a Node.js writable stream.
 *
 * The connection timeout only covers receiving the response headers. Once
 * streaming starts, the read timeout is reset for every received chunk.
 *
 * @param url - Backup response URL
 * @param createDestination - Creates the stream that receives the response body.
 *   Deferred so no destination (e.g. an empty file) exists when the request fails.
 * @returns HTTP response status
 * @internal
 */
export async function downloadStream(
  url: string,
  createDestination: () => Writable,
): Promise<number> {
  const abortController = new AbortController()

  let response: StreamResponse
  try {
    response = await request({
      as: 'stream',
      signal: abortController.signal,
      url,
    })
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new Error('Backup download timed out before receiving a response. Try again.', {
        cause: error,
      })
    }
    throw error
  }

  let destination: Writable
  try {
    destination = createDestination()
  } catch (error) {
    await response.body.cancel().catch(() => {
      // Surface the destination error, not the cancellation error.
    })
    throw error
  }

  let readTimeout: NodeJS.Timeout | undefined
  const resetReadTimeout = () => {
    if (readTimeout) clearTimeout(readTimeout)
    readTimeout = setTimeout(() => {
      const timeoutMinutes = READ_TIMEOUT / (60 * 1000)
      const error = new Error(
        `Backup download stalled: no data received for ${timeoutMinutes} minutes. Try again.`,
      )
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
