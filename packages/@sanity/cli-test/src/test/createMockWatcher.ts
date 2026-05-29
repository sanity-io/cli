import {vi, type Mock} from 'vitest'

/**
 * @internal
 */
export interface MockWatcher {
  add: Mock
  emit: (event: string, ...args: unknown[]) => void
  on: (event: string, listener: (...args: unknown[]) => void) => void
}

/**
 * Creates a mock Vite watcher for testing.
 *
 * @returns A mock watcher object with add, emit, and on methods
 * @internal
 */
export function createMockWatcher(): MockWatcher {
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
