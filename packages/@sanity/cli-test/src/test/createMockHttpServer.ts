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
