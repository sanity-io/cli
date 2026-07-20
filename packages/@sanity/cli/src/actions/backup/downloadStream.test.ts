import {Writable} from 'node:stream'

import {type CreateRequesterOptions, type FetchFunction} from '@sanity/cli-core/request'
import {createMockFetch} from 'get-it/mock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {downloadStream} from './downloadStream.js'

import 'get-it/vitest'

// The requester is created at module scope, so swap the fetch implementation
// through a ref: get-it/mock for transport-level tests, and a hand-rolled
// FetchFunction where the mock cannot express the scenario (stalled bodies,
// observing response body cancellation).
const fetchRef = vi.hoisted(() => ({current: undefined as FetchFunction | undefined}))
const requesterOptions = vi.hoisted(() => ({
  current: undefined as CreateRequesterOptions | undefined,
}))

vi.mock('@sanity/cli-core/request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core/request')>()
  return {
    ...actual,
    createRequester: (options: CreateRequesterOptions) => {
      requesterOptions.current = options
      return actual.createRequester({
        ...options,
        fetch: (url, init) => {
          if (!fetchRef.current) throw new Error('No fetch configured for this test')
          return fetchRef.current(url, init)
        },
      })
    },
  }
})

const CONNECTION_TIMEOUT = 15 * 1000
const READ_TIMEOUT = 3 * 60 * 1000
const RETRY_ATTEMPTS = 6 // 1 initial + 5 default retries

const mock = createMockFetch()

/** Builds a FetchFunction returning a streaming body the mock cannot express. */
function createStreamingFetch(body: ReadableStream<Uint8Array>): FetchFunction {
  return async (url) => ({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    body,
    headers: new Headers(),
    ok: true,
    redirected: false,
    status: 200,
    statusText: 'OK',
    text: () => Promise.resolve(''),
    url,
  })
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
  beforeEach(() => {
    fetchRef.current = mock.fetch
  })

  afterEach(() => {
    mock.clear()
    vi.useRealTimers()
  })

  test('streams the response body into the destination', async () => {
    const chunks: Buffer[] = []
    mock.on('GET', 'https://example.com/backup').respond({body: 'hello world', status: 206})

    const status = await downloadStream('https://example.com/backup', () =>
      createDestination(chunks),
    )

    expect(status).toBe(206)
    expect(Buffer.concat(chunks).toString()).toBe('hello world')
    expect(mock).toHaveReceivedRequest('GET', 'https://example.com/backup')
    expect(mock).toHaveConsumedAllMocks()
    expect(requesterOptions.current).toMatchObject({
      middleware: [expect.any(Function), expect.any(Function)],
      timeout: false,
    })
  })

  test('does not create the destination when the request fails', async () => {
    const createFailedDestination = vi.fn(() => createDestination())
    mock.on('GET', 'https://example.com/backup').respond({status: 500})

    await expect(
      downloadStream('https://example.com/backup', createFailedDestination),
    ).rejects.toMatchObject({name: 'HttpError', status: 500})

    expect(createFailedDestination).not.toHaveBeenCalled()
  })

  test('cancels the response when creating the destination fails', async () => {
    const cancel = vi.fn()
    fetchRef.current = createStreamingFetch(new ReadableStream({cancel}))

    await expect(
      downloadStream('https://example.com/backup', () => {
        throw new Error('Destination unavailable')
      }),
    ).rejects.toThrow('Destination unavailable')

    expect(cancel).toHaveBeenCalledOnce()
  })

  test('starts a separate connection timeout for each retry attempt', async () => {
    vi.useFakeTimers()
    // Each attempt waits on a "server" that responds slower than the
    // connection deadline, so every attempt times out and is retried.
    mock
      .on('GET', 'https://example.com/backup')
      .respondPersist({body: 'never delivered', delay: CONNECTION_TIMEOUT * 4, status: 200})

    const startedAt = Date.now()
    let rejectedAt = startedAt
    const download = downloadStream('https://example.com/backup', () => createDestination()).catch(
      (error: unknown) => {
        rejectedAt = Date.now()
        throw error
      },
    )
    const rejection = expect(download).rejects.toMatchObject({
      code: 'ETIMEDOUT',
      message: 'Backup download timed out before receiving a response. Try again.',
    })

    // Each attempt runs its full 15s deadline plus retry backoff in between.
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT + 5000)
    }

    await rejection
    expect(mock).toHaveReceivedRequestTimes('GET', 'https://example.com/backup', RETRY_ATTEMPTS)
    // With a single shared deadline, the download would reject after ~15s.
    expect(rejectedAt - startedAt).toBeGreaterThanOrEqual(RETRY_ATTEMPTS * CONNECTION_TIMEOUT)
  })

  test('aborts and cancels the response when no data arrives before the read timeout', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    fetchRef.current = createStreamingFetch(new ReadableStream({cancel}))

    const download = downloadStream('https://example.com/backup', () => createDestination())
    const rejection = expect(download).rejects.toThrow(
      'Backup download stalled: no data received for 3 minutes. Try again.',
    )
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT)

    await rejection
    expect(cancel).toHaveBeenCalledOnce()
  })
})
