import {Transform, type TransformCallback, type Writable} from 'node:stream'
import {pipeline} from 'node:stream/promises'

import {
  createNodeFetch,
  createRequester,
  type FetchFunction,
  nodeReadableFromWeb,
  retry,
  type StreamResponse,
} from '@sanity/cli-core/request'

const CONNECTION_TIMEOUT = 15 * 1000 // 15 seconds
const READ_TIMEOUT = 3 * 60 * 1000 // 3 minutes

const nodeFetch = createNodeFetch()
const fetchWithConnectionTimeout: FetchFunction = async (url, init) => {
  const connectionController = new AbortController()
  const connectionTimeout = setTimeout(() => {
    connectionController.abort(
      new Error('Backup download timed out before receiving a response. Try again.'),
    )
  }, CONNECTION_TIMEOUT)
  connectionTimeout.unref()

  const signal = init?.signal
    ? AbortSignal.any([init.signal, connectionController.signal])
    : connectionController.signal
  try {
    return await nodeFetch(url, {...init, signal})
  } finally {
    clearTimeout(connectionTimeout)
  }
}

const request = createRequester({
  fetch: fetchWithConnectionTimeout,
  middleware: [retry()],
  timeout: false,
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

  let response: StreamResponse
  try {
    response = await request({
      as: 'stream',
      signal: abortController.signal,
      url,
    })
  } catch (error) {
    destination.destroy()
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
