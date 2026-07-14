import {setupNockHygiene} from '@sanity/cli-test/test/mockApi'
import {vi} from 'vitest'

/**
 * Default mocks
 */
// Mock open, to prevent it from opening a browser
vi.mock('open')

// Fail any test that sets up API mocks it never consumes, and reset nock
// between tests so interceptors never leak across test boundaries.
setupNockHygiene()

// `@oclif/core/lib/screen.js` reads `process.stdout.getWindowSize()` at module
// init when `process.stdout.isTTY` is truthy. Vitest's stdout proxy doesn't
// implement `getWindowSize`, so any test that flips `isTTY = true` before oclif
// is loaded (e.g. `checkForUpdates.test.ts`) crashes the whole worker.
// Provide a no-op shim once per worker so the eventual load is safe.
for (const stream of [process.stdout, process.stderr] as const) {
  if (typeof stream.getWindowSize !== 'function') {
    Object.defineProperty(stream, 'getWindowSize', {
      configurable: true,
      value: () => [80, 24],
      writable: true,
    })
  }
}
