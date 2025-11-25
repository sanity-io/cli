import * as stubs from './stubs.js'

/**
 * Sets up browser globals (window, document, etc.) in the global scope.
 *
 * This is used by both mockBrowserEnvironment (for child processes) and
 * studioWorkerLoader (for worker threads) to provide a browser-like environment.
 *
 * @param options - Configuration options
 * @internal
 */
export async function setupBrowserStubs(): Promise<void> {
  // Inject browser stubs into global scope
  const mockStubs = stubs as unknown as Record<string, unknown>
  const mockedGlobalThis: Record<string, unknown> = globalThis
  for (const key in stubs) {
    if (!(key in mockedGlobalThis)) {
      mockedGlobalThis[key] = mockStubs[key]
    }
  }
}
