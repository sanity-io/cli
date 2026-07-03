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

// A current desktop Chrome UA: a known-safe engine on the modulepreload
// allowlist, so it gets the modulepreload as well as the preconnect.
const chromeUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// Desktop Safari and iOS Safari: WebKit engines that blank the studio when the
// modulepreload follows the CDN's cross-origin redirect, so the modulepreload
// must be withheld from both (the safe preconnect still runs).
const desktopSafariUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const iosSafariUserAgent =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'

// An iOS UA carrying a `Chrome` token (an in-app webview or spoof): WebKit
// under the hood, so it must be withheld. The allowlist's engine token would
// match it — the iOS device-name exclusion is the only thing keeping the
// modulepreload off, which proves that guard is load-bearing, not dead code.
const iosChromeTokenUserAgent =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile/15E148 Safari/604.1'

// An unrecognised engine matching neither the device-name nor the allowlist:
// default-deny must withhold the modulepreload rather than risk bricking it.
const unknownEngineUserAgent = 'SomeFutureBrowser/1.0'

function createRuntimeDom(html: string, userAgent: string = chromeUserAgent): JSDOM {
  return new JSDOM(html, {
    beforeParse(window) {
      window.Date.now = () => fixedTimestamp
      // The injected script branches on navigator.userAgent to gate the hints,
      // so the UA the in-page script sees must be stubbed before it runs.
      Object.defineProperty(window.navigator, 'userAgent', {
        configurable: true,
        get: () => userAgent,
      })
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

  describe.each([
    ['desktop Chrome', chromeUserAgent],
    ['desktop Safari', desktopSafariUserAgent],
    ['iOS Safari', iosSafariUserAgent],
    ['an iOS webview with a Chrome token', iosChromeTokenUserAgent],
    ['an unrecognised engine', unknownEngineUserAgent],
  ])('preconnect is safe in every engine (%s)', (_label, userAgent) => {
    test('warms the CDN connection with a crossorigin preconnect', () => {
      const importMap = {
        imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
      }
      const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)
      const dom = createRuntimeDom(result, userAgent)

      const preconnectLinks = dom.window.document.querySelectorAll('link[rel="preconnect"]')
      expect(preconnectLinks).toHaveLength(1)
      expect(preconnectLinks[0].getAttribute('href')).toBe('https://sanity-cdn.com')
      expect(preconnectLinks[0].getAttribute('crossorigin')).toBe('anonymous')
    })
  })

  test('modulepreloads sanity with a timestamp matching the importmap entry (no double fetch)', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)
    const dom = createRuntimeDom(result, chromeUserAgent)

    const preloadLinks = dom.window.document.querySelectorAll('link[rel="modulepreload"]')
    expect(preloadLinks).toHaveLength(1)
    const preloadHref = preloadLinks[0].getAttribute('href')
    expect(preloadHref).toBe(
      'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1700000000',
    )
    expect(preloadLinks[0].getAttribute('crossorigin')).toBe('anonymous')

    const importMapEl = dom.window.document.querySelector('script[type="importmap"]')
    const runtimeImportMap = JSON.parse(importMapEl?.textContent || '{}') as {
      imports?: Record<string, string>
    }
    // The preload href must equal what the importmap resolves `sanity` to,
    // otherwise the browser fetches the largest chunk twice.
    expect(preloadHref).toBe(runtimeImportMap.imports?.sanity)
  })

  test('emits no hints when sanity resolves to a non-CDN host', () => {
    const importMap = {imports: {sanity: 'https://example.com/modules/sanity/index.js'}}
    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)
    const dom = createRuntimeDom(result, chromeUserAgent)

    expect(dom.window.document.querySelectorAll('link[rel="preconnect"]')).toHaveLength(0)
    expect(dom.window.document.querySelectorAll('link[rel="modulepreload"]')).toHaveLength(0)
  })

  test('emits no hints when no import resolves to a sanity-cdn host', () => {
    const importMap = {
      imports: {external: 'https://example.com/modules/external/index.js'},
    }
    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)
    const dom = createRuntimeDom(result, chromeUserAgent)

    expect(dom.window.document.querySelectorAll('link[rel="preconnect"]')).toHaveLength(0)
    expect(dom.window.document.querySelectorAll('link[rel="modulepreload"]')).toHaveLength(0)
  })

  describe.each([
    ['desktop Safari', desktopSafariUserAgent],
    ['iOS Safari', iosSafariUserAgent],
    ['an iOS webview with a Chrome token (device guard wins)', iosChromeTokenUserAgent],
    ['an unrecognised engine', unknownEngineUserAgent],
  ])('modulepreload is withheld outside the allowlist (%s)', (_label, gatedUserAgent) => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const cssUrls = [
      'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890/index.css',
    ]

    test('withholds the modulepreload while keeping the safe preconnect', () => {
      const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)
      const dom = createRuntimeDom(result, gatedUserAgent)

      expect(dom.window.document.querySelectorAll('link[rel="modulepreload"]')).toHaveLength(0)
      expect(dom.window.document.querySelectorAll('link[rel="preconnect"]')).toHaveLength(1)
    })

    test('still rewrites the import map and emits stylesheet links (graceful fallback)', () => {
      const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap, cssUrls)
      const dom = createRuntimeDom(result, gatedUserAgent)

      const importMapEl = dom.window.document.querySelector('script[type="importmap"]')
      const runtimeImportMap = JSON.parse(importMapEl?.textContent || '{}') as {
        imports?: Record<string, string>
      }
      expect(runtimeImportMap.imports?.sanity).toBe(
        'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1700000000',
      )

      const stylesheetLinks = [
        ...dom.window.document.querySelectorAll('link[rel="stylesheet"]'),
      ].map((link) => link.getAttribute('href'))
      expect(stylesheetLinks).toEqual([
        'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1700000000/index.css',
      ])
    })
  })
})
