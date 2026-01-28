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
