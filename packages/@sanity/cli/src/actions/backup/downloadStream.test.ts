import {Writable} from 'node:stream'

import {type RequestOptions, type StreamResponse} from '@sanity/cli-core/request'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {downloadStream} from './downloadStream.js'

const mockRequest = vi.hoisted(() => vi.fn<(options: RequestOptions) => Promise<StreamResponse>>())

vi.mock('@sanity/cli-core/request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core/request')>()
  return {
    ...actual,
    createRequester: () => mockRequest,
  }
})

const CONNECTION_TIMEOUT = 15 * 1000
const READ_TIMEOUT = 3 * 60 * 1000

function createResponse(body: ReadableStream<Uint8Array>, status = 200): StreamResponse {
  return {
    body,
    headers: new Headers(),
    status,
    statusText: 'OK',
  }
}

function createDestination(chunks: Buffer[] = []): Writable {
  return new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(Buffer.from(chunk))
      callback()
    },
  })
}

describe('#downloadStream', () => {
  afterEach(() => {
    mockRequest.mockReset()
    vi.useRealTimers()
  })

  test('streams the response body into the destination', async () => {
    const chunks: Buffer[] = []
    mockRequest.mockResolvedValue(
      createResponse(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('hello'))
            controller.enqueue(new TextEncoder().encode(' world'))
            controller.close()
          },
        }),
        206,
      ),
    )

    const status = await downloadStream('https://example.com/backup', createDestination(chunks))

    expect(status).toBe(206)
    expect(Buffer.concat(chunks).toString()).toBe('hello world')
    expect(mockRequest).toHaveBeenCalledWith({
      as: 'stream',
      signal: expect.any(AbortSignal),
      timeout: false,
      url: 'https://example.com/backup',
    })
  })

  test('aborts when response headers exceed the connection timeout', async () => {
    vi.useFakeTimers()
    mockRequest.mockImplementation(
      ({signal}) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), {once: true})
        }),
    )

    const download = downloadStream('https://example.com/backup', createDestination())
    const rejection = expect(download).rejects.toThrow(
      'Backup download timed out before receiving a response. Try again.',
    )
    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT)

    await rejection
  })

  test('aborts and cancels the response when no data arrives before the read timeout', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    mockRequest.mockResolvedValue(
      createResponse(
        new ReadableStream({
          cancel,
        }),
      ),
    )

    const download = downloadStream('https://example.com/backup', createDestination())
    const rejection = expect(download).rejects.toThrow(
      'Backup download stalled: no data received for 3 minutes. Try again.',
    )
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT)

    await rejection
    expect(cancel).toHaveBeenCalledOnce()
  })
})
