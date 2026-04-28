import {JSDOM} from 'jsdom'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {addTimestampedImportMapScriptToHtml} from '../addTimestampImportMapScriptToHtml'

const baseHtml = '<html><head></head><body></body></html>'

describe('addTimestampedImportMapScriptToHtml', () => {
  test('returns html unchanged when no importMap is provided', () => {
    const result = addTimestampedImportMapScriptToHtml(baseHtml)
    expect(result).toBe(baseHtml)
  })

  test('injects import map JSON into the head', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)

    expect(result).toContain('id="__imports"')
    expect(result).toContain('"sanity"')
    expect(result).toContain('sanity-cdn.com')
  })

  test('injects the timestamped import map injector script', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)

    expect(result).toContain('importmap')
    expect(result).toContain('__imports')
  })

  test('includes CSS URLs as a css array in the __imports JSON', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const cssUrls = [
      'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890/index.css',
      'https://sanity-cdn.com/v1/modules/@sanity__vision/default/%5E3.2.0/t1234567890/index.css',
    ]

    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap, cssUrls)

    const match = result.match(/id="__imports">([^<]+)</)
    expect(match).toBeTruthy()
    const importsData = JSON.parse(match![1])
    expect(importsData.css).toEqual(cssUrls)
    expect(importsData.imports).toEqual(importMap.imports)
  })

  test('omits the css array when no CSS URLs are provided', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)

    const match = result.match(/id="__imports">([^<]+)</)
    const importsData = JSON.parse(match![1])
    expect(importsData.css).toBeUndefined()
  })

  test('does not emit static <link> tags — CSS is created by the runtime script', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const cssUrls = [
      'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890/index.css',
    ]

    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap, cssUrls)

    // The provided CSS URL should not be emitted as a static stylesheet tag in the HTML.
    expect(result).not.toContain(`<link rel="stylesheet" href="${cssUrls[0]}"`)
  })

  test('runtime script creates link tags synchronously with fresh timestamps', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)

    // Script reads the css array from __imports
    expect(result).toContain('css = []')
    // Script creates <link> elements
    expect(result).toContain("createElement('link')")
    // Script sets rel="stylesheet"
    expect(result).toContain("linkEl.rel = 'stylesheet'")
    // Script applies the fresh timestamp via replaceTimestamp
    expect(result).toContain('replaceTimestamp(cssUrl)')
    // Appended to head
    expect(result).toContain('document.head.appendChild(linkEl)')
  })

  test('runtime script uses shared replaceTimestamp for both imports and CSS', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)

    expect(result).toContain('function replaceTimestamp')
    // Used for import map entries
    expect(result).toContain('[specifier, replaceTimestamp(path)]')
    // Used for CSS URLs
    expect(result).toContain('replaceTimestamp(cssUrl)')
  })

  test('handles html string with no <html> wrapper', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const result = addTimestampedImportMapScriptToHtml('<head></head><body></body>', importMap)

    expect(result).toContain('id="__imports"')
    expect(result).toContain('<html>')
  })

  test('handles html string with no <head>', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const result = addTimestampedImportMapScriptToHtml('<html><body></body></html>', importMap)

    expect(result).toContain('id="__imports"')
    expect(result).toContain('<head>')
  })
})

const fixedTimestamp = 1_700_000_000_000

function createRuntimeDom(html: string) {
  return new JSDOM(html, {
    beforeParse(window) {
      window.Date.now = () => fixedTimestamp
    },
    runScripts: 'dangerously',
    url: 'https://example.test/',
  })
}

describe('tests the runtime TIMESTAMPED_IMPORTMAP_INJECTOR_SCRIPT', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
  test('executes runtime script and injects the expected import map', () => {
    const importMap = {
      imports: {
        external: 'https://example.com/modules/external/index.js',
        sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890',
      },
    }

    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)
    const dom = createRuntimeDom(result)

    const importMapEl = dom.window.document.querySelector('script[type="importmap"]')
    expect(importMapEl).toBeTruthy()

    const runtimeImportMap = JSON.parse(importMapEl?.textContent || '{}') as {
      imports?: Record<string, string>
    }

    expect(runtimeImportMap.imports?.sanity).toBe(
      'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1700000000',
    )
    expect(runtimeImportMap.imports?.external).toBe('https://example.com/modules/external/index.js')
  })

  test('executes runtime script and appends stylesheet links with the expected URLs', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const cssUrls = [
      'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890/index.css',
      'https://example.com/styles/external.css',
    ]

    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap, cssUrls)
    const dom = createRuntimeDom(result)

    const stylesheetLinks = [...dom.window.document.querySelectorAll('link[rel="stylesheet"]')].map(
      (link) => link.getAttribute('href'),
    )

    expect(stylesheetLinks).toEqual([
      'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1700000000/index.css',
      'https://example.com/styles/external.css',
    ])
  })
})
