import {describe, expect, test} from 'vitest'

import {addApiPreconnectLinksToHtml} from '../addApiPreconnectLinksToHtml.js'

const origin = 'https://abc123.api.sanity.io'

describe('addApiPreconnectLinksToHtml', () => {
  test('returns the html untouched without an origin', () => {
    const html = '<html><head></head><body></body></html>'
    expect(addApiPreconnectLinksToHtml(html)).toBe(html)
    expect(addApiPreconnectLinksToHtml(html, '')).toBe(html)
  })

  test('returns the html untouched when there is no head', () => {
    const html = '<div>no head</div>'
    expect(addApiPreconnectLinksToHtml(html, origin)).toBe(html)
  })

  test('adds anonymous and credentialed preconnect hints, plus dns-prefetch', () => {
    const result = addApiPreconnectLinksToHtml('<html><head></head><body></body></html>', origin)

    expect(result).toContain(`<link rel="preconnect" href="${origin}" crossorigin>`)
    expect(result).toContain(
      `<link rel="preconnect" href="${origin}" crossorigin="use-credentials">`,
    )
    expect(result).toContain(`<link rel="dns-prefetch" href="${origin}">`)
  })

  test('keeps the charset declaration ahead of the hints', () => {
    const result = addApiPreconnectLinksToHtml(
      '<html><head><meta charset="utf-8"><title>Studio</title></head><body></body></html>',
      origin,
    )

    expect(result.indexOf('<meta charset="utf-8">')).toBeLessThan(
      result.indexOf('rel="preconnect"'),
    )
    expect(result.indexOf('rel="preconnect"')).toBeLessThan(result.indexOf('<title>'))
  })

  test('places the hints first in the head when there is no charset', () => {
    const result = addApiPreconnectLinksToHtml(
      '<html><head><title>Studio</title></head><body></body></html>',
      origin,
    )

    expect(result.startsWith('<html><head><link rel="preconnect"')).toBe(true)
  })
})
