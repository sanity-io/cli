import * as stubs from './stubs.js'

/**
 * Sets up browser globals (window, document, etc.) in the global scope.
 *
 * This is used by both mockBrowserEnvironment (for child processes) and
 * studioWorkerLoader (for worker threads) to provide a browser-like environment.
 *
 * @returns A cleanup function that removes the injected globals
 * @internal
 */
export async function setupBrowserStubs(): Promise<() => void> {
  // Guard against double-registering
  if (globalThis.window && '__mockedBySanity' in globalThis.window) {
    return () => {
      /* intentional noop - already mocked */
    }
  }

  // Inject browser stubs into global scope
  const mockStubs = stubs as unknown as Record<string, unknown>
  const mockedGlobalThis: Record<string, unknown> = globalThis
  const stubbedKeys: string[] = []

  for (const key in stubs) {
    if (!(key in mockedGlobalThis)) {
      mockedGlobalThis[key] = mockStubs[key]
      stubbedKeys.push(key)
    }
  }

  // Add marker to window to detect double-mocking
  if (globalThis.window) {
    ;(globalThis.window as unknown as Record<string, unknown>).__mockedBySanity = true
  }

  // Return cleanup function
  return () => {
    for (const key of stubbedKeys) {
      delete mockedGlobalThis[key]
    }

    // Remove marker
    if (globalThis.window) {
      delete (globalThis.window as unknown as Record<string, unknown>).__mockedBySanity
    }
  }
}
