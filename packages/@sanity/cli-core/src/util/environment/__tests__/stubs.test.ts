import {describe, expect, test} from 'vitest'

import {browserStubs} from '../stubs.js'

describe('browserStubs', () => {
  test('includes DOM constructors needed by libraries like styled-components', () => {
    expect(browserStubs).toHaveProperty('Element')
    expect(browserStubs).toHaveProperty('HTMLElement')
    expect(browserStubs).toHaveProperty('HTMLDivElement')
    expect(browserStubs).toHaveProperty('Node')
    expect(browserStubs).toHaveProperty('Text')
    expect(browserStubs).toHaveProperty('Document')
    expect(browserStubs).toHaveProperty('DocumentFragment')
    expect(browserStubs).toHaveProperty('ShadowRoot')
    expect(browserStubs).toHaveProperty('SVGElement')
  })

  test('includes core browser globals', () => {
    expect(browserStubs).toHaveProperty('document')
    expect(browserStubs).toHaveProperty('window')
    expect(browserStubs).toHaveProperty('location')
    expect(browserStubs).toHaveProperty('history')
    expect(browserStubs).toHaveProperty('localStorage')
    expect(browserStubs).toHaveProperty('sessionStorage')
    expect(browserStubs).toHaveProperty('screen')
  })

  test('includes custom polyfill stubs', () => {
    expect(browserStubs).toHaveProperty('ResizeObserver')
    expect(browserStubs).toHaveProperty('IntersectionObserver')
    expect(browserStubs).toHaveProperty('matchMedia')
    expect(browserStubs).toHaveProperty('requestIdleCallback')
    expect(browserStubs).toHaveProperty('cancelIdleCallback')
  })

  test('excludes Node.js built-in globals', () => {
    expect(browserStubs).not.toHaveProperty('Array')
    expect(browserStubs).not.toHaveProperty('Object')
    expect(browserStubs).not.toHaveProperty('Promise')
    expect(browserStubs).not.toHaveProperty('Map')
    expect(browserStubs).not.toHaveProperty('Set')
    expect(browserStubs).not.toHaveProperty('process')
    expect(browserStubs).not.toHaveProperty('Buffer')
  })

  test('excludes internal JSDOM properties', () => {
    const internalKeys = Object.keys(browserStubs).filter((k) => k.startsWith('_'))
    expect(internalKeys).toEqual([])
  })

  test('excludes numeric indices', () => {
    const numericKeys = Object.keys(browserStubs).filter((k) => /^\d+$/.test(k))
    expect(numericKeys).toEqual([])
  })

  test('contains a substantial number of browser globals', () => {
    // JSDOM provides 300+ browser-specific properties beyond what Node.js has
    expect(Object.keys(browserStubs).length).toBeGreaterThan(200)
  })
})
