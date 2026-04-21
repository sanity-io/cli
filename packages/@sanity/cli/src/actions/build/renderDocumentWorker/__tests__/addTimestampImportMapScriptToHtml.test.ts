import {describe, expect, test} from 'vitest'

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

    // The provided CSS URL should not be emitted as a static stylesheet tag in the HTML it will be injected by the runtime script
    expect(result).not.toContain(cssUrls[0])
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
})
