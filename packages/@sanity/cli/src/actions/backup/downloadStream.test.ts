import {Writable} from 'node:stream'

import {
  type CreateRequesterOptions,
  type FetchFunction,
  type RequestOptions,
  type StreamResponse,
} from '@sanity/cli-core/request'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {downloadStream} from './downloadStream.js'

const mockRequest = vi.hoisted(() => vi.fn<(options: RequestOptions) => Promise<StreamResponse>>())
const mockNodeFetch = vi.hoisted(() => vi.fn<FetchFunction>())
const requesterOptions = vi.hoisted(() => ({
  current: undefined as CreateRequesterOptions | undefined,
}))

vi.mock('@sanity/cli-core/request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core/request')>()
  return {
    ...actual,
    createNodeFetch: () => mockNodeFetch,
    createRequester: (options: CreateRequesterOptions) => {
      requesterOptions.current = options
      return mockRequest
    },
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
    mockNodeFetch.mockReset()
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
      url: 'https://example.com/backup',
    })
    expect(requesterOptions.current).toMatchObject({
      fetch: expect.any(Function),
      timeout: false,
    })
  })

  test('destroys the destination when the request fails before streaming', async () => {
    const destination = createDestination()
    mockRequest.mockRejectedValue(new Error('Request failed'))

    await expect(downloadStream('https://example.com/backup', destination)).rejects.toThrow(
      'Request failed',
    )

    expect(destination.destroyed).toBe(true)
  })

  test('gives each fetch attempt a separate connection timeout', async () => {
    vi.useFakeTimers()
    mockNodeFetch.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {once: true})
        }),
    )
    const fetch = requesterOptions.current?.fetch
    if (!fetch) throw new Error('Expected a configured fetch function')

    const firstAttempt = fetch('https://example.com/backup')
    const firstRejection = expect(firstAttempt).rejects.toThrow(
      'Backup download timed out before receiving a response. Try again.',
    )
    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT)
    await firstRejection

    const secondAttempt = fetch('https://example.com/backup')
    const secondRejection = expect(secondAttempt).rejects.toThrow(
      'Backup download timed out before receiving a response. Try again.',
    )
    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT - 1)
    expect(mockNodeFetch.mock.calls[1]?.[1]?.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await secondRejection
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
