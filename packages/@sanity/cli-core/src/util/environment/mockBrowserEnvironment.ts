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
 * @internal
 */
export async function mockBrowserEnvironment(basePath: string): Promise<void> {
  // 1. Setup browser globals
  await setupBrowserStubs()

  // 2. Load and set environment variables into process.env
  const envVars = await getStudioEnvironmentVariables(basePath)
  for (const [key, value] of Object.entries(envVars)) {
    if (typeof value === 'string') {
      process.env[key] = value
    }
  }
}
