import {describe, expect, test} from 'vitest'

import {addTimestampedImportMapScriptToHtml} from '../addTimestampImportMapScriptToHtml'

const baseHtml = '<html><head></head><body></body></html>'

describe('addTimestampedImportMapScriptToHtml', () => {
  test('returns html unchanged when no importMap is provided', () => {
    const result = addTimestampedImportMapScriptToHtml(baseHtml)
    expect(result).toBe(baseHtml)
  })

  test('injects import map JSON into the head', () => {
    const importMap = {imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'}}
    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)

    expect(result).toContain('id="__imports"')
    expect(result).toContain('"sanity"')
    expect(result).toContain('sanity-cdn.com')
  })

  test('includes css array in __imports JSON when autoUpdatesCssUrls provided', () => {
    const importMap = {imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'}}
    const cssUrls = [
      'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890/index.css',
      'https://sanity-cdn.com/v1/modules/@sanity__vision/default/%5E3.2.0/t1234567890/index.css',
    ]

    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap, cssUrls)

    // Parse the __imports JSON from the output
    const match = result.match(/id="__imports">([^<]+)</)
    expect(match).toBeTruthy()

    const importsData = JSON.parse(match![1])
    expect(importsData.css).toEqual(cssUrls)
    expect(importsData.imports).toEqual(importMap.imports)
  })

  test('does not include css key when autoUpdatesCssUrls is empty', () => {
    const importMap = {imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'}}

    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap, [])

    const match = result.match(/id="__imports">([^<]+)</)
    const importsData = JSON.parse(match![1])
    expect(importsData.css).toBeUndefined()
  })

  test('does not include css key when autoUpdatesCssUrls is undefined', () => {
    const importMap = {imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'}}

    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap, undefined)

    const match = result.match(/id="__imports">([^<]+)</)
    const importsData = JSON.parse(match![1])
    expect(importsData.css).toBeUndefined()
  })

  test('injects the timestamped import map injector script', () => {
    const importMap = {imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'}}
    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)

    expect(result).toContain('importmap')
    expect(result).toContain('__imports')
  })

  test('runtime script includes CSS link tag creation and CSS URLs are stored in JSON', () => {
    const importMap = {imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'}}
    const cssUrls = ['https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890/index.css']

    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap, cssUrls)

    // Verify CSS URLs are actually stored in the __imports JSON
    const match = result.match(/id="__imports">([^<]+)</)
    expect(match).toBeTruthy()
    const importsData = JSON.parse(match![1])
    expect(importsData.css).toEqual(cssUrls)

    // The runtime script should handle CSS
    expect(result).toContain('css.forEach')
    expect(result).toContain("link.rel = 'stylesheet'")
    expect(result).toContain('replaceTimestamp')
  })

  test('runtime script uses shared replaceTimestamp for both JS and CSS', () => {
    const importMap = {imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'}}
    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)

    // The replaceTimestamp function should be defined once and used for both
    expect(result).toContain('function replaceTimestamp')
    // Used for import map entries
    expect(result).toContain('[specifier, replaceTimestamp(path)]')
    // Used for CSS URLs
    expect(result).toContain('replaceTimestamp(cssUrl)')
  })

  test('runtime script has error handling for JSON.parse', () => {
    const importMap = {imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'}}
    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)

    // Should have try-catch around JSON.parse
    expect(result).toContain('try')
    expect(result).toContain('JSON.parse')
    expect(result).toContain('console.warn')
    expect(result).toContain('Failed to parse __imports JSON')
  })

  test('runtime script does not leak css array into import map', () => {
    const importMap = {imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity/default/%5E3.2.0/t1234567890'}}
    const result = addTimestampedImportMapScriptToHtml(baseHtml, importMap)

    // The script should remove css from the import map data
    expect(result).toContain('delete importMapData.css')
  })
})
