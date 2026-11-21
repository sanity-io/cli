import {describe, expect, test} from 'vitest'

import {getBrowserStubs} from '../stubs.js'

describe('getBrowserStubs()', () => {
  test('includes DOM constructors needed by libraries like styled-components', () => {
    expect(getBrowserStubs()).toHaveProperty('Element')
    expect(getBrowserStubs()).toHaveProperty('HTMLElement')
    expect(getBrowserStubs()).toHaveProperty('HTMLDivElement')
    expect(getBrowserStubs()).toHaveProperty('Node')
    expect(getBrowserStubs()).toHaveProperty('Text')
    expect(getBrowserStubs()).toHaveProperty('Document')
    expect(getBrowserStubs()).toHaveProperty('DocumentFragment')
    expect(getBrowserStubs()).toHaveProperty('ShadowRoot')
    expect(getBrowserStubs()).toHaveProperty('SVGElement')
  })

  test('includes core browser globals', () => {
    expect(getBrowserStubs()).toHaveProperty('document')
    expect(getBrowserStubs()).toHaveProperty('window')
    expect(getBrowserStubs()).toHaveProperty('location')
    expect(getBrowserStubs()).toHaveProperty('history')
    expect(getBrowserStubs()).toHaveProperty('localStorage')
    expect(getBrowserStubs()).toHaveProperty('sessionStorage')
    expect(getBrowserStubs()).toHaveProperty('screen')
  })

  test('includes custom polyfill stubs', () => {
    expect(getBrowserStubs()).toHaveProperty('ResizeObserver')
    expect(getBrowserStubs()).toHaveProperty('IntersectionObserver')
    expect(getBrowserStubs()).toHaveProperty('matchMedia')
    expect(getBrowserStubs()).toHaveProperty('requestIdleCallback')
    expect(getBrowserStubs()).toHaveProperty('cancelIdleCallback')
  })

  test('excludes Node.js built-in globals', () => {
    expect(getBrowserStubs()).not.toHaveProperty('Array')
    expect(getBrowserStubs()).not.toHaveProperty('Object')
    expect(getBrowserStubs()).not.toHaveProperty('Promise')
    expect(getBrowserStubs()).not.toHaveProperty('Map')
    expect(getBrowserStubs()).not.toHaveProperty('Set')
    expect(getBrowserStubs()).not.toHaveProperty('AbortController')
    expect(getBrowserStubs()).not.toHaveProperty('AbortSignal')
    expect(getBrowserStubs()).not.toHaveProperty('process')
    expect(getBrowserStubs()).not.toHaveProperty('Buffer')
  })

  test('excludes internal JSDOM properties', () => {
    const internalKeys = Object.keys(getBrowserStubs()).filter((k) => k.startsWith('_'))
    expect(internalKeys).toEqual([])
  })

  test('excludes numeric indices', () => {
    const numericKeys = Object.keys(getBrowserStubs()).filter((k) => /^\d+$/.test(k))
    expect(numericKeys).toEqual([])
  })

  test('contains a substantial number of browser globals', () => {
    // JSDOM provides 300+ browser-specific properties beyond what Node.js has
    expect(Object.keys(getBrowserStubs()).length).toBeGreaterThan(200)
  })
})
