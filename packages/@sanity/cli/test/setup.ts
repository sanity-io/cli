import {vi} from 'vitest'

// Diagnostic listeners for the Windows worker-crash investigation.
// Vitest's "Worker exited unexpectedly" doesn't tell us *why* a fork died.
// These log to stderr (vitest tees to the job log) so a failing CI run will
// show the actual cause. Remove after the root cause is found.
if (process.platform === 'win32') {
  process.on('uncaughtException', (err) => {
    // eslint-disable-next-line no-console
    console.error('[win-diag] uncaughtException:', err?.stack || err)
  })
  process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('[win-diag] unhandledRejection:', reason)
  })
  process.on('warning', (warning) => {
    // eslint-disable-next-line no-console
    console.error('[win-diag] warning:', warning.name, warning.message)
  })
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGBREAK', 'SIGHUP'] as const) {
    process.on(sig, () => {
      // eslint-disable-next-line no-console
      console.error(`[win-diag] received signal: ${sig}`)
    })
  }
  process.on('beforeExit', (code) => {
    // eslint-disable-next-line no-console
    console.error(`[win-diag] beforeExit code=${code}`)
  })
  process.on('exit', (code) => {
    // eslint-disable-next-line no-console
    console.error(`[win-diag] exit code=${code}`)
  })
}

/**
 * Default mocks
 */
// Mock open, to prevent it from opening a browser
vi.mock('open')

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
