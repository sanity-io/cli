import {getBrowserStubs} from './stubs.js'

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

  // Inject browser stubs into global scope. `getBrowserStubs()` has already
  // decided what to inject — including a small set of keys (e.g.
  // `localStorage`/`sessionStorage`/`Storage`) that we want to take from JSDOM
  // even if Node provides them, so realm identity stays consistent.
  const stubs = getBrowserStubs()
  const mockedGlobalThis: Record<string, unknown> = globalThis
  const stubbedKeys: string[] = []
  const originalDescriptors = new Map<string, PropertyDescriptor>()

  for (const key of Object.keys(stubs)) {
    // Snapshot via descriptor to avoid triggering getters (e.g. Node 26's
    // `localStorage` getter logs an ExperimentalWarning on read).
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key)
    if (descriptor) {
      originalDescriptors.set(key, descriptor)
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
      const descriptor = originalDescriptors.get(key)
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor)
      } else {
        delete mockedGlobalThis[key]
      }
    }
  }
}
