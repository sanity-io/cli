// @vitest-environment jsdom
import {afterEach, describe, expect, test} from 'vitest'

import {
  decorateIndexWithAuthHashScript,
  MIN_SANITY_VERSION_READING_AUTH_HASH_STASH,
} from '../decorateIndexWithAuthHashScript'

const sampleHtml = '<html><head><script src="app.js"></script></head><body></body></html>'

function runScript(hash: string) {
  history.replaceState({key: 'state'}, '', `/studio/desk?foo=1${hash}`)
  const html = decorateIndexWithAuthHashScript(
    '<head></head>',
    MIN_SANITY_VERSION_READING_AUTH_HASH_STASH,
  )
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1]
  if (!script) throw new Error('script not found')
  globalThis.eval(script)
}

const scope = globalThis as {__SANITY_AUTH_HASH_PARAMS__?: unknown}

afterEach(() => {
  delete scope.__SANITY_AUTH_HASH_PARAMS__
})

describe('decorateIndexWithAuthHashScript', () => {
  test('injects the script as the first child of head', () => {
    const result = decorateIndexWithAuthHashScript(
      sampleHtml,
      MIN_SANITY_VERSION_READING_AUTH_HASH_STASH,
    )

    expect(result.startsWith('<html><head>\n<script>')).toBe(true)
    expect(result.indexOf('__SANITY_AUTH_HASH_PARAMS__')).toBeLessThan(result.indexOf('app.js'))
  })

  test('handles head tag with attributes', () => {
    const result = decorateIndexWithAuthHashScript(
      '<html><head lang="en"></head></html>',
      MIN_SANITY_VERSION_READING_AUTH_HASH_STASH,
    )

    expect(result).toContain('<head lang="en">\n<script>')
  })

  test.each([
    ['an unknown version', null],
    ['a version that only reads the hash', '6.18.0'],
    ['a prerelease of the minimum version', `${MIN_SANITY_VERSION_READING_AUTH_HASH_STASH}-next.1`],
  ])('returns the template unchanged for %s', (_, version) => {
    expect(decorateIndexWithAuthHashScript(sampleHtml, version)).toBe(sampleHtml)
  })

  test.each([MIN_SANITY_VERSION_READING_AUTH_HASH_STASH, '7.0.0'])(
    'injects the script for sanity %s',
    (version) => {
      expect(decorateIndexWithAuthHashScript(sampleHtml, version)).toContain(
        '__SANITY_AUTH_HASH_PARAMS__',
      )
    },
  )

  test('removes the sid from the hash and stashes it', () => {
    runScript('#sid=abc%2B123')

    expect(location.hash).toBe('')
    expect(location.pathname + location.search).toBe('/studio/desk?foo=1')
    expect(history.state).toEqual({key: 'state'})
    expect(scope.__SANITY_AUTH_HASH_PARAMS__).toEqual({sid: 'abc%2B123'})
  })

  test('keeps other params in order', () => {
    runScript('#a=1&token=tok&b=2&claim=c&sid=s&c=3')

    expect(location.hash).toBe('#a=1&b=2&c=3')
    expect(scope.__SANITY_AUTH_HASH_PARAMS__).toEqual({claim: 'c', sid: 's', token: 'tok'})
  })

  test('does nothing when the hash has no secrets', () => {
    runScript('#mysid=1&foo=bar')

    expect(location.hash).toBe('#mysid=1&foo=bar')
    expect(scope.__SANITY_AUTH_HASH_PARAMS__).toBeUndefined()
  })
})
