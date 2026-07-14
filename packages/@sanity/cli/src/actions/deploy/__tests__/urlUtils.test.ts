import {describe, expect, test} from 'vitest'

import {normalizeUrl, validateUrl} from '../urlUtils.js'

describe('validateUrl', () => {
  test('returns true for valid https URL', () => {
    expect(validateUrl('https://studio.example.com')).toBe(true)
  })

  test('returns true for valid http URL', () => {
    expect(validateUrl('http://studio.example.com')).toBe(true)
  })

  test('returns true for URL with path', () => {
    expect(validateUrl('https://example.com/studio')).toBe(true)
  })

  test('returns error string for ftp URL', () => {
    expect(validateUrl('ftp://example.com')).toBe('URL must use http or https protocol')
  })

  test('returns error string for invalid URL', () => {
    expect(validateUrl('not-a-url')).toBe('Invalid URL. Please enter a valid http or https URL')
  })

  test('returns error string for empty string', () => {
    expect(validateUrl('')).toBe('Invalid URL. Please enter a valid http or https URL')
  })
})

describe('normalizeUrl', () => {
  test('removes trailing slash', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com')
  })

  test('removes multiple trailing slashes', () => {
    expect(normalizeUrl('https://example.com///')).toBe('https://example.com')
  })

  test('leaves URL without trailing slash unchanged', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com')
  })

  test('only removes trailing slashes, not path slashes', () => {
    expect(normalizeUrl('https://example.com/studio/')).toBe('https://example.com/studio')
  })
})
