import {type MessagePort} from 'node:worker_threads'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {
  createOneShotWorkerLifecycle,
  deserializeStudioWorkerError,
  isStudioWorkerErrorMessage,
} from '../studioWorkerLifecycle.js'

function createMockParentPort(postMessage = vi.fn()) {
  return {
    parentPort: {postMessage} as unknown as MessagePort,
    postMessage,
  }
}

describe('createOneShotWorkerLifecycle', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  test('closes the server before forwarding the task result', async () => {
    const calls: string[] = []
    const {parentPort, postMessage} = createMockParentPort(vi.fn(() => calls.push('postMessage')))
    const closeServer = vi.fn(async () => {
      calls.push('closeServer')
    })
    const lifecycle = createOneShotWorkerLifecycle({
      closeServer,
      onCloseError: vi.fn(),
      parentPort,
    })

    parentPort.postMessage({type: 'success'})
    await lifecycle.close()

    expect(calls).toEqual(['closeServer', 'postMessage'])
    expect(closeServer).toHaveBeenCalledOnce()
    expect(postMessage).toHaveBeenCalledWith({type: 'success'})
  })

  test('forwards transfer lists after closing the server', async () => {
    const {parentPort, postMessage} = createMockParentPort()
    const lifecycle = createOneShotWorkerLifecycle({
      closeServer: vi.fn().mockResolvedValue(undefined),
      onCloseError: vi.fn(),
      parentPort,
    })
    const buffer = new ArrayBuffer(8)

    parentPort.postMessage('result', [buffer])
    await lifecycle.close()

    expect(postMessage).toHaveBeenCalledWith('result', [buffer])
  })

  test('uses one close attempt for the result and finalizer', async () => {
    const {parentPort} = createMockParentPort()
    const closeServer = vi.fn().mockResolvedValue(undefined)
    const lifecycle = createOneShotWorkerLifecycle({
      closeServer,
      onCloseError: vi.fn(),
      parentPort,
    })

    parentPort.postMessage('result')
    await Promise.all([lifecycle.close(), lifecycle.close()])

    expect(closeServer).toHaveBeenCalledOnce()
  })

  test('forwards the result when closing the server rejects', async () => {
    const closeError = new Error('close failed')
    const onCloseError = vi.fn()
    const {parentPort, postMessage} = createMockParentPort()
    const lifecycle = createOneShotWorkerLifecycle({
      closeServer: vi.fn().mockRejectedValue(closeError),
      onCloseError,
      parentPort,
    })

    parentPort.postMessage('result')
    await lifecycle.close()

    expect(onCloseError).toHaveBeenCalledWith(closeError)
    expect(postMessage).toHaveBeenCalledWith('result')
  })

  test('bounds a hung server close before forwarding the result', async () => {
    vi.useFakeTimers()
    const onCloseError = vi.fn()
    const {parentPort, postMessage} = createMockParentPort()
    const lifecycle = createOneShotWorkerLifecycle({
      closeServer: vi.fn(() => new Promise<void>(() => {})),
      onCloseError,
      parentPort,
      timeout: 500,
    })

    const closePromise = lifecycle.close()
    parentPort.postMessage('result')
    await vi.advanceTimersByTimeAsync(500)
    await closePromise

    expect(onCloseError).toHaveBeenCalledWith(
      expect.objectContaining({message: 'Vite server close timed out after 500ms'}),
    )
    expect(postMessage).toHaveBeenCalledWith('result')
  })

  test('posts serialized task errors after closing the server', async () => {
    const calls: string[] = []
    const {parentPort, postMessage} = createMockParentPort(vi.fn(() => calls.push('postError')))
    const lifecycle = createOneShotWorkerLifecycle({
      closeServer: vi.fn(async () => {
        calls.push('closeServer')
      }),
      onCloseError: vi.fn(),
      parentPort,
    })

    await lifecycle.postError(new TypeError('invalid config'))

    expect(calls).toEqual(['closeServer', 'postError'])
    const message: unknown = postMessage.mock.calls[0]?.[0]
    expect(isStudioWorkerErrorMessage(message)).toBe(true)
    if (!isStudioWorkerErrorMessage(message)) throw new Error('Expected worker error message')

    const error = deserializeStudioWorkerError(message)
    expect(error).toMatchObject({
      cause: expect.objectContaining({message: 'invalid config', name: 'TypeError'}),
      message: 'Worker error: invalid config',
    })
  })

  test('serializes thrown non-error values', async () => {
    const {parentPort, postMessage} = createMockParentPort()
    const lifecycle = createOneShotWorkerLifecycle({
      closeServer: vi.fn().mockResolvedValue(undefined),
      onCloseError: vi.fn(),
      parentPort,
    })

    await lifecycle.postError('invalid config')

    expect(postMessage).toHaveBeenCalledWith({
      error: {message: 'invalid config', name: 'Error'},
      type: 'sanity.studioWorker.error',
    })
  })
})

describe('isStudioWorkerErrorMessage', () => {
  test.each([
    undefined,
    null,
    'error',
    {},
    {type: 'different'},
    {error: null, type: 'sanity.studioWorker.error'},
    {error: {message: 42, name: 'Error'}, type: 'sanity.studioWorker.error'},
    {error: {message: 'broken', name: 42}, type: 'sanity.studioWorker.error'},
    {
      error: {message: 'broken', name: 'Error', stack: 42},
      type: 'sanity.studioWorker.error',
    },
  ])('rejects malformed values: %o', (value) => {
    expect(isStudioWorkerErrorMessage(value)).toBe(false)
  })
})
