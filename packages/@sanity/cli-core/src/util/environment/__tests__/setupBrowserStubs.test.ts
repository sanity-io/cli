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
