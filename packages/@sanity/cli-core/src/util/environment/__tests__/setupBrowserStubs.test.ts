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
    const originalAbortController = globalThis.AbortController
    const originalAbortSignal = globalThis.AbortSignal

    cleanup = await setupBrowserStubs()

    expect(globalThis.setTimeout).toBe(originalSetTimeout)
    expect(globalThis.AbortController).toBe(originalAbortController)
    expect(globalThis.AbortSignal).toBe(originalAbortSignal)
  })

  test('Node AbortSignal is accepted by JSDOM addEventListener', async () => {
    cleanup = await setupBrowserStubs()

    const controller = new AbortController()
    const el = globalThis.document.createElement('div')

    // This should not throw - both signal and addEventListener are from JSDOM
    expect(() => {
      el.addEventListener('click', () => {}, {signal: controller.signal})
    }).not.toThrow()
  })

  test('native fetch still accepts Node AbortSignal after setup', async () => {
    cleanup = await setupBrowserStubs()

    const response = await fetch('data:text/plain,ok', {signal: AbortSignal.timeout(1000)})

    expect(await response.text()).toBe('ok')
  })

  test('overwrites getter-only globals (e.g. Node 26 localStorage)', async () => {
    // Simulate Node 26's getter-only `localStorage` descriptor, regardless of
    // the Node version actually running the test. Plain assignment to a
    // getter-only property throws in strict mode, so this verifies that setup
    // uses `Object.defineProperty` and cleanup restores the original getter.
    const key = 'localStorage'
    const globals = globalThis as Record<string, unknown>
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      enumerable: false,
      get: () => 'original',
    })

    try {
      cleanup = await setupBrowserStubs()
      // JSDOM's localStorage is an object, not the string 'original'.
      expect(globals[key]).not.toBe('original')
      expect(typeof globals[key]).toBe('object')

      cleanup()
      cleanup = undefined

      expect(globals[key]).toBe('original')
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, key, originalDescriptor)
      } else {
        delete globals[key]
      }
    }
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
