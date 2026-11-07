import {JSDOM} from 'jsdom'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {addTimestampedImportMapScriptToHtml} from '../addTimestampImportMapScriptToHtml.js'

const mockInsert = vi.hoisted(() => vi.fn())
const mockAppend = vi.hoisted(() => vi.fn())
const mockQuerySelector = vi.hoisted(() => vi.fn().mockReturnThis())
const fakeDom = vi.hoisted(() => ({
  append: mockAppend,
  insertAdjacentHTML: mockInsert,
  querySelector: mockQuerySelector,
}))
const mockParse = vi.hoisted(() => vi.fn(() => fakeDom))
vi.mock('node-html-parser', () => ({
  parse: mockParse,
}))

const baseHtml = '<html><head></head><body></body></html>'
const importMap = {
  imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
}

describe('addTimestampedImportMapScriptToHtml', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })
  test('does not modify html when no importMap is provided', () => {
    addTimestampedImportMapScriptToHtml(baseHtml)
    expect(mockAppend).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  test('injects import map JSON and timestamped import map injector script into the head', () => {
    addTimestampedImportMapScriptToHtml(baseHtml, importMap)

    expect(mockInsert).toHaveBeenCalledWith(
      'beforeend',
      expect.stringContaining('<script type="application/json" id="__imports">'),
    )
    expect(mockInsert).toHaveBeenCalledWith(
      'beforeend',
      expect.stringContaining(JSON.stringify(importMap)),
    )
    expect(mockInsert).toHaveBeenCalledWith(
      'beforeend',
      expect.stringContaining('auto-generated script to add import map with timestamp'),
    )
  })

  test('rounds the runtime timestamp down to the current minute', () => {
    vi.useFakeTimers({now: 1_800_000_037_000, toFake: ['Date']})
    addTimestampedImportMapScriptToHtml(baseHtml, importMap)

    const injectedScript = mockInsert.mock.calls
      .map(([, html]) => html as string)
      .find((html) => html.includes('auto-generated script to add import map with timestamp'))
    const scriptContent = injectedScript?.match(/^<script>([\s\S]*)<\/script>$/)?.[1]
    const dom = new JSDOM(
      `<script type="application/json" id="__imports">${JSON.stringify(importMap)}</script>`,
      {runScripts: 'outside-only'},
    )
    dom.window.Date.now = Date.now
    Object.defineProperty(dom.window.navigator, 'userAgent', {value: 'Firefox'})
    dom.window.eval(scriptContent!)

    const runtimeImportMap = JSON.parse(
      dom.window.document.querySelector<HTMLScriptElement>('script[type="importmap"]')!
        .textContent!,
    )
    expect(runtimeImportMap.imports.sanity).toBe(
      'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1800000000',
    )
    expect(
      dom.window.document.querySelector<HTMLLinkElement>('link[rel="modulepreload"]')!.href,
    ).toBe(runtimeImportMap.imports.sanity)
  })

  test('includes CSS URLs as a css array in the __imports JSON if provided', () => {
    const cssUrls = [
      'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890/index.css',
      'https://sanity-cdn.com/v1/modules/@sanity__vision/default/%5E3.2.0/t1234567890/index.css',
    ]

    addTimestampedImportMapScriptToHtml(baseHtml, importMap, cssUrls)

    expect(mockInsert).toHaveBeenCalledWith(
      'beforeend',
      expect.stringContaining('<script type="application/json" id="__imports">'),
    )
    expect(mockInsert).toHaveBeenCalledWith(
      'beforeend',
      expect.stringContaining(JSON.stringify({...importMap, css: cssUrls})),
    )
  })

  test('handles html string with no <html> wrapper', () => {
    // Make first call to querySelector return falsy, triggering lack-of-html-el conditional
    mockQuerySelector.mockReturnValueOnce(null as unknown as typeof fakeDom)
    addTimestampedImportMapScriptToHtml('<head></head><body></body>', importMap)

    expect(mockAppend).toHaveBeenCalled()
    expect(mockInsert).toHaveBeenCalledWith(
      'beforeend',
      expect.stringContaining('<script type="application/json" id="__imports">'),
    )
    expect(mockInsert).toHaveBeenCalledWith(
      'beforeend',
      expect.stringContaining(JSON.stringify(importMap)),
    )
    expect(mockInsert).toHaveBeenCalledWith(
      'beforeend',
      expect.stringContaining('auto-generated script to add import map with timestamp'),
    )
  })

  test('handles html string with no <head>', () => {
    // Make second call to querySelector return falsy, triggering lack-of-head-el conditional
    mockQuerySelector
      .mockReturnValueOnce(fakeDom)
      .mockReturnValueOnce(null as unknown as typeof fakeDom)
    addTimestampedImportMapScriptToHtml('<html><body></body></html>', importMap)

    expect(mockInsert).toHaveBeenCalledWith('afterbegin', '<head></head>')
    expect(mockInsert).toHaveBeenCalledWith(
      'beforeend',
      expect.stringContaining('<script type="application/json" id="__imports">'),
    )
    expect(mockInsert).toHaveBeenCalledWith(
      'beforeend',
      expect.stringContaining(JSON.stringify(importMap)),
    )
    expect(mockInsert).toHaveBeenCalledWith(
      'beforeend',
      expect.stringContaining('auto-generated script to add import map with timestamp'),
    )
  })
})
