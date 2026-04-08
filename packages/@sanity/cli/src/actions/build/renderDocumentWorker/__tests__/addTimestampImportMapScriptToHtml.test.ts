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

  test('does not include css array in __imports JSON', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const cssUrls = [
      'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890/index.css',
    ]

    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap, cssUrls)

    // __imports JSON should only contain imports, not css
    const match = result.match(/id="__imports">([^<]+)</)
    expect(match).toBeTruthy()
    const importsData = JSON.parse(match![1])
    expect(importsData.css).toBeUndefined()
    expect(importsData.imports).toEqual(importMap.imports)
  })

  test('injects the timestamped import map injector script', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)

    expect(result).toContain('importmap')
    expect(result).toContain('__imports')
  })

  test('adds static <link> tags for CSS URLs in the HTML', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const cssUrls = [
      'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890/index.css',
      'https://sanity-cdn.com/v1/modules/@sanity__vision/default/%5E3.2.0/t1234567890/index.css',
    ]

    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap, cssUrls)

    // Static <link> tags should be in the HTML with data-auto-update-css attribute
    expect(result).toContain(
      '<link rel="stylesheet" href="https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890/index.css" data-auto-update-css>',
    )
    expect(result).toContain(
      '<link rel="stylesheet" href="https://sanity-cdn.com/v1/modules/@sanity__vision/default/%5E3.2.0/t1234567890/index.css" data-auto-update-css>',
    )
  })

  test('does not add static <link> tags when no CSS URLs provided', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }

    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)

    expect(result).not.toContain('data-auto-update-css')
  })

  test('runtime script updates existing CSS link tags instead of creating new ones', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)

    // Should query for existing links and update href
    expect(result).toContain("querySelectorAll('link[data-auto-update-css]')")
    expect(result).toContain('replaceTimestamp(link.href)')
    // Should NOT create new link elements
    expect(result).not.toContain("createElement('link')")
  })

  test('runtime script uses shared replaceTimestamp for both JS and CSS', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)

    // The replaceTimestamp function should be defined once and used for both
    expect(result).toContain('function replaceTimestamp')
    // Used for import map entries
    expect(result).toContain('[specifier, replaceTimestamp(path)]')
    // Used for CSS link tags
    expect(result).toContain('replaceTimestamp(link.href)')
  })

  test('runtime script has error handling for JSON.parse', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)

    // Should have try-catch around JSON.parse
    expect(result).toContain('try')
    expect(result).toContain('JSON.parse')
    expect(result).toContain('console.warn')
    expect(result).toContain('Failed to parse __imports JSON')
  })

  test('static CSS link tags appear before the runtime script', () => {
    const importMap = {
      imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'},
    }
    const cssUrls = [
      'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890/index.css',
    ]

    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap, cssUrls)

    const linkPos = result.indexOf('data-auto-update-css')
    const scriptPos = result.indexOf('auto-generated script to add import map')
    expect(linkPos).toBeGreaterThan(-1)
    expect(scriptPos).toBeGreaterThan(-1)
    expect(linkPos).toBeLessThan(scriptPos)
  })
})
