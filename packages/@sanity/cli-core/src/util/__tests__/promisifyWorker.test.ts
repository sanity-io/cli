import {type Worker} from 'node:worker_threads'

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

describe('promisifyWorker', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('resolves with the first message from the worker', async () => {
    const worker = createMockWorker()
    const promise = promisifyWorker(worker as unknown as Worker)

    worker.emit('message', 'hello')

    await expect(promise).resolves.toBe('hello')
  })

  test('resolves with a typed object message', async () => {
    const worker = createMockWorker()
    const payload = {count: 42, name: 'test'}
    const promise = promisifyWorker<{count: number; name: string}>(worker as unknown as Worker)

    worker.emit('message', payload)

    await expect(promise).resolves.toEqual({count: 42, name: 'test'})
  })

  test('rejects on worker error with wrapped message and cause', async () => {
    const worker = createMockWorker()
    const promise = promisifyWorker(worker as unknown as Worker)
    const originalError = new Error('something broke')

    worker.emit('error', originalError)

    await expect(promise).rejects.toThrow('Worker error: something broke')
    await expect(promise).rejects.toMatchObject({cause: originalError})
  })

  test('rejects on messageerror with deserialization message', async () => {
    const worker = createMockWorker()
    const promise = promisifyWorker(worker as unknown as Worker)
    const deserializationError = new Error('could not deserialize')

    worker.emit('messageerror', deserializationError)

    await expect(promise).rejects.toThrow('Failed to deserialize worker message')
  })

  test('rejects on non-zero exit code', async () => {
    const worker = createMockWorker()
    const promise = promisifyWorker(worker as unknown as Worker)

    worker.emit('exit', 1)

    await expect(promise).rejects.toThrow('Worker exited with code 1')
  })

  test('does not reject on zero exit code after message', async () => {
    const worker = createMockWorker()
    const promise = promisifyWorker(worker as unknown as Worker)

    worker.emit('message', 'success')
    worker.emit('exit', 0)

    await expect(promise).resolves.toBe('success')
  })

  test('rejects when worker exits with code 0 without sending a message', async () => {
    const worker = createMockWorker()
    const promise = promisifyWorker(worker as unknown as Worker)

    worker.emit('exit', 0)

    await expect(promise).rejects.toThrow('Worker exited without sending a message')
  })

  test('terminates the worker after receiving a message', async () => {
    const worker = createMockWorker()
    const promise = promisifyWorker(worker as unknown as Worker)

    worker.emit('message', 'data')
    await promise

    // terminate is called via setImmediate, so flush it
    await new Promise((resolve) => setImmediate(resolve))
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  test('removes all listeners after receiving a message', async () => {
    const worker = createMockWorker()
    const promise = promisifyWorker(worker as unknown as Worker)

    worker.emit('message', 'data')
    await promise

    expect(worker.removeAllListeners).toHaveBeenCalledOnce()
  })

  test('terminates the worker after an error', async () => {
    const worker = createMockWorker()
    const promise = promisifyWorker(worker as unknown as Worker)

    worker.emit('error', new Error('fail'))
    await promise.catch(() => {})

    await new Promise((resolve) => setImmediate(resolve))
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(worker.removeAllListeners).toHaveBeenCalledOnce()
  })

  test('terminates the worker after a messageerror', async () => {
    const worker = createMockWorker()
    const promise = promisifyWorker(worker as unknown as Worker)

    worker.emit('messageerror', new Error('bad message'))
    await promise.catch(() => {})

    await new Promise((resolve) => setImmediate(resolve))
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(worker.removeAllListeners).toHaveBeenCalledOnce()
  })

  test('resolves with only the first message when multiple are emitted', async () => {
    const worker = createMockWorker()
    const promise = promisifyWorker(worker as unknown as Worker)

    worker.emit('message', 'first')
    worker.emit('message', 'second')

    await expect(promise).resolves.toBe('first')
  })

  test('registers listeners for all four events', () => {
    const worker = createMockWorker()
    promisifyWorker(worker as unknown as Worker)

    expect(worker.addListener).toHaveBeenCalledWith('error', expect.any(Function))
    expect(worker.addListener).toHaveBeenCalledWith('exit', expect.any(Function))
    expect(worker.addListener).toHaveBeenCalledWith('messageerror', expect.any(Function))
    expect(worker.addListener).toHaveBeenCalledWith('message', expect.any(Function))
  })

  test('does not call cleanup on non-zero exit', async () => {
    const worker = createMockWorker()
    const promise = promisifyWorker(worker as unknown as Worker)

    worker.emit('exit', 2)
    await promise.catch(() => {})

    expect(worker.removeAllListeners).not.toHaveBeenCalled()
    expect(worker.terminate).not.toHaveBeenCalled()
  })

  test('rejects with error when error is followed by non-zero exit', async () => {
    const worker = createMockWorker()
    const promise = promisifyWorker(worker as unknown as Worker)

    worker.emit('error', new Error('crash'))
    worker.emit('exit', 1)

    await expect(promise).rejects.toThrow('Worker error: crash')
    expect(worker.removeAllListeners).toHaveBeenCalledOnce()
  })

  test('resolves with message even if worker later exits with non-zero code', async () => {
    const worker = createMockWorker()
    const promise = promisifyWorker(worker as unknown as Worker)

    worker.emit('message', 'result')
    worker.emit('exit', 1)

    await expect(promise).resolves.toBe('result')
  })
})
