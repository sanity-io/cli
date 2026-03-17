import {FORCE_JSDOM_GLOBALS, getBrowserStubs} from './stubs.js'

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
  const stubs = getBrowserStubs()
  const mockedGlobalThis: Record<string, unknown> = globalThis
  const stubbedKeys: string[] = []
  const originalValues: Record<string, unknown> = {}

  for (const key of Object.keys(stubs)) {
    if (key in mockedGlobalThis) {
      // Force-override certain globals that must come from JSDOM (see FORCE_JSDOM_GLOBALS)
      if (FORCE_JSDOM_GLOBALS.has(key)) {
        originalValues[key] = mockedGlobalThis[key]
        mockedGlobalThis[key] = stubs[key]
        stubbedKeys.push(key)
      }
      continue
    }
    mockedGlobalThis[key] = stubs[key]
    stubbedKeys.push(key)
  }

  // Add marker to window to detect double-mocking
  if (globalThis.window) {
    ;(globalThis.window as unknown as Record<string, unknown>).__mockedBySanity = true
  }

  // Return cleanup function
  return () => {
    // Remove marker before deleting window
    if (globalThis.window) {
      delete (globalThis.window as unknown as Record<string, unknown>).__mockedBySanity
    }

    for (const key of stubbedKeys) {
      if (key in originalValues) {
        mockedGlobalThis[key] = originalValues[key]
      } else {
        delete mockedGlobalThis[key]
      }
    }
  }
}
