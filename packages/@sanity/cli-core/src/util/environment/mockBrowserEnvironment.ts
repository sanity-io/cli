import {getStudioEnvironmentVariables} from './getStudioEnvironmentVariables.js'
import {setupBrowserStubs} from './setupBrowserStubs.js'

/**
 * Mocks a browser-like environment for processes in the main thread by:
 * - Injecting browser globals (window, document, ResizeObserver, etc.)
 * - Loading studio environment variables from the project's sanity installation into process.env
 *
 * This is useful for commands like `sanity exec` that have to run user scripts
 * in the main thread of the process (but in a child process).
 *
 * Be cautious when using this, since it will pollute the global namespace with browser globals.
 *
 * If your code can run in a worker thread, you should use the `studioWorkerTask` function instead.
 *
 * @param basePath - The root path of the Sanity Studio project
 * @returns A cleanup function that removes the injected globals and environment variables
 * @internal
 */
export async function mockBrowserEnvironment(basePath: string): Promise<() => void> {
  // 1. Setup browser globals
  const cleanupBrowserStubs = await setupBrowserStubs()

  // 2. Load and set environment variables into process.env
  const envVars = await getStudioEnvironmentVariables(basePath)
  const setEnvKeys: string[] = []
  const originalEnvValues: Record<string, string | undefined> = {}

  for (const [key, value] of Object.entries(envVars)) {
    // Store original value (if any) so we can restore it
    originalEnvValues[key] = process.env[key]
    process.env[key] = value
    setEnvKeys.push(key)
  }

  // Return cleanup function
  return () => {
    // Restore or delete environment variables
    for (const key of setEnvKeys) {
      if (originalEnvValues[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = originalEnvValues[key]
      }
    }

    // Clean up browser stubs
    cleanupBrowserStubs()
  }
}
