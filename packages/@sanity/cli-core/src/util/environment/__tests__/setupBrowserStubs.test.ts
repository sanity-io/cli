import {afterEach, describe, expect, test} from 'vitest'

import {setupBrowserStubs} from '../setupBrowserStubs.js'

describe('setupBrowserStubs', () => {
  let cleanup: (() => void) | undefined

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  test('injects browser globals into globalThis', async () => {
    cleanup = await setupBrowserStubs()

    // Element is a browser-only global that Node.js does not provide
    expect((globalThis as Record<string, unknown>).Element).toBeDefined()
    expect((globalThis as Record<string, unknown>).HTMLElement).toBeDefined()
  })

  test('cleanup removes injected globals', async () => {
    const cleanupFn = await setupBrowserStubs()

    expect((globalThis as Record<string, unknown>).Element).toBeDefined()

    cleanupFn()

    expect((globalThis as Record<string, unknown>).Element).toBeUndefined()
  })

  test('does not overwrite existing Node.js globals', async () => {
    const originalSetTimeout = globalThis.setTimeout

    cleanup = await setupBrowserStubs()

    expect(globalThis.setTimeout).toBe(originalSetTimeout)
  })

  test('prevents double-mocking by returning noop on second call', async () => {
    cleanup = await setupBrowserStubs()

    expect((globalThis as Record<string, unknown>).Element).toBeDefined()

    // Second call should be a noop
    const secondCleanup = await setupBrowserStubs()
    secondCleanup()

    // Element should still be defined because the second cleanup was a noop
    expect((globalThis as Record<string, unknown>).Element).toBeDefined()
  })
})
