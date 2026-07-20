import {Writable} from 'node:stream'

import {
  type BufferedResponse,
  type CreateRequesterOptions,
  type RequestOptions,
  type StreamResponse,
  type WrappingMiddleware,
} from '@sanity/cli-core/request'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {downloadStream} from './downloadStream.js'

const mockRequest = vi.hoisted(() => vi.fn<(options: RequestOptions) => Promise<StreamResponse>>())
const requesterOptions = vi.hoisted(() => ({
  current: undefined as CreateRequesterOptions | undefined,
}))

vi.mock('@sanity/cli-core/request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core/request')>()
  return {
    ...actual,
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

    const status = await downloadStream('https://example.com/backup', () =>
      createDestination(chunks),
    )

    expect(status).toBe(206)
    expect(Buffer.concat(chunks).toString()).toBe('hello world')
    expect(mockRequest).toHaveBeenCalledWith({
      as: 'stream',
      signal: expect.any(AbortSignal),
      url: 'https://example.com/backup',
    })
    expect(requesterOptions.current).toMatchObject({
      middleware: [expect.any(Function), expect.any(Function)],
      timeout: false,
    })
  })

  test('does not create the destination when the request fails', async () => {
    const createFailedDestination = vi.fn(() => createDestination())
    mockRequest.mockRejectedValue(new Error('Request failed'))

    await expect(
      downloadStream('https://example.com/backup', createFailedDestination),
    ).rejects.toThrow('Request failed')

    expect(createFailedDestination).not.toHaveBeenCalled()
  })

  test('cancels the response when creating the destination fails', async () => {
    const cancel = vi.fn()
    mockRequest.mockResolvedValue(createResponse(new ReadableStream({cancel})))

    await expect(
      downloadStream('https://example.com/backup', () => {
        throw new Error('Destination unavailable')
      }),
    ).rejects.toThrow('Destination unavailable')

    expect(cancel).toHaveBeenCalledOnce()
  })

  test('starts a separate connection timeout for each retry attempt', async () => {
    vi.useFakeTimers()
    const next = vi.fn<(options: RequestOptions) => Promise<BufferedResponse>>()
    next.mockImplementation(
      ({signal}) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), {once: true})
        }),
    )
    const connectionTimeout = requesterOptions.current?.middleware?.[1] as
      | WrappingMiddleware
      | undefined
    if (!connectionTimeout) throw new Error('Expected connection timeout middleware')

    const options = {url: 'https://example.com/backup'}
    const firstAttempt = connectionTimeout(options, next)
    const firstRejection = expect(firstAttempt).rejects.toMatchObject({
      code: 'ETIMEDOUT',
      message: 'Backup download timed out before receiving a response. Try again.',
    })
    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT)
    await firstRejection

    const secondAttempt = connectionTimeout(options, next)
    const secondRejection = expect(secondAttempt).rejects.toMatchObject({
      code: 'ETIMEDOUT',
      message: 'Backup download timed out before receiving a response. Try again.',
    })
    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT - 1)
    expect(next.mock.calls[1]?.[0].signal?.aborted).toBe(false)
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

    const download = downloadStream('https://example.com/backup', () => createDestination())
    const rejection = expect(download).rejects.toThrow(
      'Backup download stalled: no data received for 3 minutes. Try again.',
    )
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT)

    await rejection
    expect(cancel).toHaveBeenCalledOnce()
  })
})
