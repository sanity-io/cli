import {vi} from 'vitest'

/**
 * Interface representing a closable server or resource.
 *
 * @internal
 */
export interface Closable {
  close(callback?: (err?: Error) => void): Promise<unknown> | this
}

/**
 * Closes a Node HTTP server (or similar). If it returns a promise, it will be
 * awaited. Otherwise, we expect the close method to take a callback and resolve
 * based on its result.
 *
 * @param server - The server to close
 * @returns A promise that resolves when the server is closed
 * @internal
 */
export function closeServer(server: Closable): Promise<void> {
  return new Promise((resolve, reject) => {
    let hasSettled = false
    const result = server.close((err) => {
      if (hasSettled) return
      hasSettled = true
      if (err) reject(err)
      else resolve()
    })

    if (isPromiseLike(result)) {
      result
        .then(() => (hasSettled ? null : resolve()))
        .catch((err) => (hasSettled ? null : reject(err)))
        .finally(() => (hasSettled = true))
    }
  })
}

/**
 * If the passed server has a `close()` method, call it. Otherwise, do nothing.
 *
 * @param server - The server to close
 * @returns A promise that resolves when the server is closed or immediately if not closable
 * @internal
 */
export function tryCloseServer(server: unknown): Promise<void> {
  return isClosable(server) ? closeServer(server) : Promise.resolve()
}

/**
 * Check if a value is Closable or not
 *
 * @param value - The value to check
 * @returns True if the value is Closable, false otherwise
 * @internal
 */
function isClosable(value: unknown): value is Closable {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    'close' in value &&
    typeof value.close === 'function'
  )
}

/**
 * Check if a value is Promise-like
 *
 * @param value - The value to check
 * @returns True if the value is Promise-like, false otherwise
 * @internal
 */
function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function' &&
    'catch' in value &&
    typeof value.catch === 'function' &&
    'finally' in value &&
    typeof value.finally === 'function'
  )
}

/**
 * Type guard to check if a value has a close method.
 * Useful for testing commands that return watchers or long-running processes.
 *
 * @param value - The value to check
 * @returns True if the value has a close method, false otherwise
 * @internal
 */
export function canCloseWatcher(value: unknown): value is {close: () => Promise<void>} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'close' in value &&
    typeof value.close === 'function'
  )
}

/**
 * Creates a mock Vite watcher for testing.
 *
 * @returns A mock watcher object with add, emit, and on methods
 * @internal
 */
export function createMockWatcher() {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()

  return {
    add: vi.fn(),
    emit(event: string, ...args: unknown[]) {
      const eventListeners = listeners.get(event) || []
      for (const listener of eventListeners) {
        listener(...args)
      }
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      if (!listeners.has(event)) {
        listeners.set(event, [])
      }
      listeners.get(event)!.push(listener)
    },
  }
}

/**
 * Creates a mock HTTP server for testing.
 *
 * @returns A mock HTTP server object with emit and once methods
 * @internal
 */
export function createMockHttpServer() {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()

  return {
    emit(event: string, ...args: unknown[]) {
      const eventListeners = listeners.get(event) || []
      for (const listener of eventListeners) {
        listener(...args)
      }
    },
    once(event: string, listener: (...args: unknown[]) => void) {
      if (!listeners.has(event)) {
        listeners.set(event, [])
      }
      listeners.get(event)!.push(listener)
    },
  }
}
