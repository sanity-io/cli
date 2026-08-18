import {vi} from 'vitest'

/**
 * Default mocks
 */
// Mock open, to prevent it from opening a browser
vi.mock('open')

// get-it v9's Node entry uses undici with a private dispatcher, which bypasses
// nock. Force the global fetch implementation so nock can intercept HTTP in tests.
vi.mock('@sanity/cli-core/request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core/request')>()
  return {
    ...actual,
    createRequester: (options?: Parameters<typeof actual.createRequester>[0]) =>
      actual.createRequester({
        ...options,
        fetch: options?.fetch ?? globalThis.fetch,
      }),
  }
})

// Same for @sanity/client v8, which routes through get-it's undici-backed
// Node fetch by default: pin its transport to the global fetch for nock. A
// caller-supplied resolveFetch (the execution-context isolation in cli-core's
// apiClient) takes precedence — execution-context tests that need nock must
// supply a nock-compatible fetch on the context itself.
vi.mock('@sanity/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/client')>()
  return {
    ...actual,
    createClient: (config: Parameters<typeof actual.createClient>[0]) =>
      actual.createClient({resolveFetch: () => globalThis.fetch, ...config}),
  }
})

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
