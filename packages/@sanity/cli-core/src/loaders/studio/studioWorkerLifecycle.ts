import {type MessagePort} from 'node:worker_threads'

const DEFAULT_STUDIO_WORKER_CLOSE_TIMEOUT = 5000

const STUDIO_WORKER_ERROR_MARKER = 'sanity.studioWorker.error'

interface SerializedStudioWorkerError {
  message: string
  name: string

  stack?: string
}

export interface StudioWorkerErrorMessage {
  error: SerializedStudioWorkerError
  type: typeof STUDIO_WORKER_ERROR_MARKER
}

interface OneShotWorkerLifecycle {
  close: () => Promise<void>
  postError: (error: unknown) => Promise<void>
}

interface OneShotWorkerLifecycleOptions {
  closeServer: () => Promise<void>
  onCloseError: (error: unknown) => void
  parentPort: MessagePort

  timeout?: number
}

/**
 * Defers messages from a one-shot studio worker until its Vite server has had
 * a bounded opportunity to close. Closing is single-flight so the task's final
 * message and the loader's finalizer can safely request it at the same time.
 */
export function createOneShotWorkerLifecycle(
  options: OneShotWorkerLifecycleOptions,
): OneShotWorkerLifecycle {
  const {
    closeServer,
    onCloseError,
    parentPort,
    timeout = DEFAULT_STUDIO_WORKER_CLOSE_TIMEOUT,
  } = options
  let closePromise: Promise<void> | undefined

  const close = () => {
    closePromise ??= closeServerWithTimeout(closeServer, timeout).catch((error) => {
      onCloseError(error)
    })
    return closePromise
  }

  const originalPostMessage = parentPort.postMessage.bind(parentPort)
  parentPort.postMessage = (...args: Parameters<MessagePort['postMessage']>) => {
    void close().then(() => originalPostMessage(...args))
  }

  return {
    close,
    async postError(error) {
      await close()
      originalPostMessage(serializeStudioWorkerError(error))
    },
  }
}

export function deserializeStudioWorkerError(message: StudioWorkerErrorMessage): Error {
  const cause = new Error(message.error.message)
  cause.name = message.error.name
  if (message.error.stack) cause.stack = message.error.stack

  return new Error(`Worker error: ${message.error.message}`, {cause})
}

export function isStudioWorkerErrorMessage(value: unknown): value is StudioWorkerErrorMessage {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('type' in value) ||
    value.type !== STUDIO_WORKER_ERROR_MARKER ||
    !('error' in value) ||
    typeof value.error !== 'object' ||
    value.error === null
  ) {
    return false
  }

  const {error} = value
  return (
    'message' in error &&
    typeof error.message === 'string' &&
    'name' in error &&
    typeof error.name === 'string' &&
    (!('stack' in error) || error.stack === undefined || typeof error.stack === 'string')
  )
}

function closeServerWithTimeout(closeServer: () => Promise<void>, timeout: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      // Vite does not expose cancellation for close(); stop waiting while the
      // unrefed worker lets the still-pending close finish with process teardown.
      reject(new Error(`Vite server close timed out after ${timeout}ms`))
    }, timeout)

    void Promise.resolve()
      .then(closeServer)
      .then(
        () => {
          clearTimeout(timeoutId)
          resolve()
        },
        (error: unknown) => {
          clearTimeout(timeoutId)
          reject(error)
        },
      )
  })
}

function serializeStudioWorkerError(error: unknown): StudioWorkerErrorMessage {
  if (error instanceof Error) {
    return {
      error: {
        message: error.message,
        name: error.name,
        ...(error.stack ? {stack: error.stack} : {}),
      },
      type: STUDIO_WORKER_ERROR_MARKER,
    }
  }

  return {
    error: {
      message: String(error),
      name: 'Error',
    },
    type: STUDIO_WORKER_ERROR_MARKER,
  }
}
