import {afterEach, describe, expect, test, vi} from 'vitest'

import {promisifyWorker} from '../promisifyWorker.js'

type ListenerCallback = (...args: unknown[]) => void

function createMockWorker() {
  const listeners: Record<string, ListenerCallback[]> = {}
  return {
    addListener: vi.fn((event: string, cb: ListenerCallback) => {
      listeners[event] ??= []
      listeners[event].push(cb)
    }),
    emit(event: string, ...args: unknown[]) {
      for (const cb of listeners[event] ?? []) cb(...args)
    },
    removeAllListeners: vi.fn(() => {
      for (const key of Object.keys(listeners)) delete listeners[key]
    }),
    terminate: vi.fn(),
  }
}

let lastCreatedWorker: ReturnType<typeof createMockWorker>

vi.mock('node:worker_threads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:worker_threads')>()
  return {
    ...actual,
    Worker: function Worker(_filePath: unknown, _options?: unknown) {
      lastCreatedWorker = createMockWorker()
      return lastCreatedWorker
    },
  }
})

const TEST_WORKER_URL = new URL('file:///test-worker.js')

describe('promisifyWorker', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  test('resolves with the first message from the worker', async () => {
    const promise = promisifyWorker(TEST_WORKER_URL, {name: 'test'})

    lastCreatedWorker.emit('message', 'hello')

    await expect(promise).resolves.toBe('hello')
  })

  test('resolves with a typed object message', async () => {
    const payload = {count: 42, name: 'test'}
    const promise = promisifyWorker<{count: number; name: string}>(TEST_WORKER_URL, {name: 'test'})

    lastCreatedWorker.emit('message', payload)

    await expect(promise).resolves.toEqual({count: 42, name: 'test'})
  })

  test('rejects on worker error with wrapped message and cause', async () => {
    const promise = promisifyWorker(TEST_WORKER_URL, {name: 'test'})
    const originalError = new Error('something broke')

    lastCreatedWorker.emit('error', originalError)

    await expect(promise).rejects.toThrow('Worker error: something broke')
    await expect(promise).rejects.toMatchObject({cause: originalError})
  })

  test('rejects on messageerror with deserialization message', async () => {
    const promise = promisifyWorker(TEST_WORKER_URL, {name: 'test'})
    const deserializationError = new Error('could not deserialize')

    lastCreatedWorker.emit('messageerror', deserializationError)

    await expect(promise).rejects.toThrow('Failed to deserialize worker message')
  })

  test('rejects on non-zero exit code', async () => {
    const promise = promisifyWorker(TEST_WORKER_URL, {name: 'test'})

    lastCreatedWorker.emit('exit', 1)

    await expect(promise).rejects.toThrow('Worker exited with code 1')
  })

  test('does not reject on zero exit code after message', async () => {
    const promise = promisifyWorker(TEST_WORKER_URL, {name: 'test'})

    lastCreatedWorker.emit('message', 'success')
    lastCreatedWorker.emit('exit', 0)

    await expect(promise).resolves.toBe('success')
  })

  test('rejects when worker exits with code 0 without sending a message', async () => {
    const promise = promisifyWorker(TEST_WORKER_URL, {name: 'test'})

    lastCreatedWorker.emit('exit', 0)

    await expect(promise).rejects.toThrow('Worker exited without sending a message')
  })

  test('terminates the worker after receiving a message', async () => {
    const promise = promisifyWorker(TEST_WORKER_URL, {name: 'test'})

    lastCreatedWorker.emit('message', 'data')
    await promise

    // terminate is called via setImmediate, so flush it
    await new Promise((resolve) => setImmediate(resolve))
    expect(lastCreatedWorker.terminate).toHaveBeenCalledOnce()
  })

  test('removes all listeners after receiving a message', async () => {
    const promise = promisifyWorker(TEST_WORKER_URL, {name: 'test'})

    lastCreatedWorker.emit('message', 'data')
    await promise

    expect(lastCreatedWorker.removeAllListeners).toHaveBeenCalledOnce()
  })

  test('terminates the worker after an error', async () => {
    const promise = promisifyWorker(TEST_WORKER_URL, {name: 'test'})

    lastCreatedWorker.emit('error', new Error('fail'))
    await promise.catch(() => {})

    await new Promise((resolve) => setImmediate(resolve))
    expect(lastCreatedWorker.terminate).toHaveBeenCalledOnce()
    expect(lastCreatedWorker.removeAllListeners).toHaveBeenCalledOnce()
  })

  test('terminates the worker after a messageerror', async () => {
    const promise = promisifyWorker(TEST_WORKER_URL, {name: 'test'})

    lastCreatedWorker.emit('messageerror', new Error('bad message'))
    await promise.catch(() => {})

    await new Promise((resolve) => setImmediate(resolve))
    expect(lastCreatedWorker.terminate).toHaveBeenCalledOnce()
    expect(lastCreatedWorker.removeAllListeners).toHaveBeenCalledOnce()
  })

  test('resolves with only the first message when multiple are emitted', async () => {
    const promise = promisifyWorker(TEST_WORKER_URL, {name: 'test'})

    lastCreatedWorker.emit('message', 'first')
    lastCreatedWorker.emit('message', 'second')

    await expect(promise).resolves.toBe('first')
  })

  test('registers listeners for all four events', () => {
    promisifyWorker(TEST_WORKER_URL, {name: 'test'})

    expect(lastCreatedWorker.addListener).toHaveBeenCalledWith('error', expect.any(Function))
    expect(lastCreatedWorker.addListener).toHaveBeenCalledWith('exit', expect.any(Function))
    expect(lastCreatedWorker.addListener).toHaveBeenCalledWith('messageerror', expect.any(Function))
    expect(lastCreatedWorker.addListener).toHaveBeenCalledWith('message', expect.any(Function))
  })

  test('does not call cleanup on non-zero exit', async () => {
    const promise = promisifyWorker(TEST_WORKER_URL, {name: 'test'})

    lastCreatedWorker.emit('exit', 2)
    await promise.catch(() => {})

    expect(lastCreatedWorker.removeAllListeners).not.toHaveBeenCalled()
    expect(lastCreatedWorker.terminate).not.toHaveBeenCalled()
  })

  test('rejects with error when error is followed by non-zero exit', async () => {
    const promise = promisifyWorker(TEST_WORKER_URL, {name: 'test'})

    lastCreatedWorker.emit('error', new Error('crash'))
    lastCreatedWorker.emit('exit', 1)

    await expect(promise).rejects.toThrow('Worker error: crash')
    expect(lastCreatedWorker.removeAllListeners).toHaveBeenCalledOnce()
  })

  test('resolves with message even if worker later exits with non-zero code', async () => {
    const promise = promisifyWorker(TEST_WORKER_URL, {name: 'test'})

    lastCreatedWorker.emit('message', 'result')
    lastCreatedWorker.emit('exit', 1)

    await expect(promise).resolves.toBe('result')
  })

  test('rejects with error when timeout expires', async () => {
    vi.useFakeTimers()

    const promise = promisifyWorker(TEST_WORKER_URL, {name: 'test', timeout: 500})

    vi.advanceTimersByTime(500)

    await expect(promise).rejects.toThrow('Worker timed out after 500ms')

    expect(lastCreatedWorker.terminate).toHaveBeenCalledOnce()
    expect(lastCreatedWorker.removeAllListeners).toHaveBeenCalledOnce()
  })

  test('cleans up timer after an error', async () => {
    vi.useFakeTimers()

    const promise = promisifyWorker(TEST_WORKER_URL, {name: 'test', timeout: 1000})

    lastCreatedWorker.emit('error', new Error('fail'))
    await promise.catch(() => {})

    vi.advanceTimersByTime(1000)

    expect(lastCreatedWorker.terminate).toHaveBeenCalledOnce()
    expect(lastCreatedWorker.removeAllListeners).toHaveBeenCalledOnce()
  })

  test('cleans up timer after a messageerror', async () => {
    vi.useFakeTimers()

    const promise = promisifyWorker(TEST_WORKER_URL, {name: 'test', timeout: 1000})

    lastCreatedWorker.emit('messageerror', new Error('bad message'))
    await promise.catch(() => {})

    vi.advanceTimersByTime(1000)

    expect(lastCreatedWorker.terminate).toHaveBeenCalledOnce()
    expect(lastCreatedWorker.removeAllListeners).toHaveBeenCalledOnce()
  })

  test('cleans up timer after receiving a message', async () => {
    vi.useFakeTimers()

    const promise = promisifyWorker(TEST_WORKER_URL, {name: 'test', timeout: 1000})

    lastCreatedWorker.emit('message', 'result')
    await promise

    vi.advanceTimersByTime(1000)

    expect(lastCreatedWorker.terminate).toHaveBeenCalledOnce()
    expect(lastCreatedWorker.removeAllListeners).toHaveBeenCalledOnce()
  })
})
