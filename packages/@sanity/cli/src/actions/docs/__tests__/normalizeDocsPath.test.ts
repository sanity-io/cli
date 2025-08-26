import {describe, expect, test} from 'vitest'

import {normalizeDocsPath} from '../normalizeDocsPath.js'

describe('#normalizeDocsPath', () => {
  test('normalizes full Sanity URLs', () => {
    expect(normalizeDocsPath('https://www.sanity.io/docs/studio/installation')).toBe(
      '/docs/studio/installation',
    )
  })

  test('leaves paths unchanged', () => {
    expect(normalizeDocsPath('/docs/studio/installation')).toBe('/docs/studio/installation')
  })

  test('handles root paths', () => {
    expect(normalizeDocsPath('https://www.sanity.io/')).toBe('/')
    expect(normalizeDocsPath('/')).toBe('/')
  })
})
