import {createRequire} from 'node:module'

import groq, {defineQuery} from 'groq'
import {describe, expect, expectTypeOf, test} from 'vitest'

type CommonJsGroq = typeof groq & {defineQuery: typeof defineQuery}

const requireFromPackage = createRequire(import.meta.url)
const commonJsGroq = requireFromPackage('groq') as CommonJsGroq

function expectPassThroughTag(tag: typeof groq) {
  expect(tag`foo${'bar'}`).toBe(`foo${'bar'}`)
  expect(tag`${'bar'}`).toBe(`${'bar'}`)
  expect(tag``).toBe('')
  expect(tag`${'foo'}`).toBe(`${'foo'}`)
  expect(tag`${/foo/}bar`).toBe(`${/foo/}bar`)
  expect(tag`${'foo'}bar${347}`).toBe(`${'foo'}bar${347}`)
  expect(tag`${'foo'}bar${347}${/qux/}`).toBe(`${'foo'}bar${347}${/qux/}`)
  expect(tag`${'foo'}${347}qux`).toBe(`${'foo'}${347}qux`)
}

describe.each([
  ['ESM', groq],
  ['CommonJS', commonJsGroq],
])('%s template tag', (_, tag) => {
  test('returns the interpolated query unchanged', () => {
    expectPassThroughTag(tag)
  })
})

describe('defineQuery', () => {
  test('returns the query unchanged through ESM and CommonJS', () => {
    const query = '*[_type == "product"]'

    expect(defineQuery(query)).toBe(query)
    expect(commonJsGroq.defineQuery(query)).toBe(query)
  })

  test('preserves literal string types', () => {
    const query = defineQuery('*[_type == "product"]')

    expectTypeOf(query).toEqualTypeOf<'*[_type == "product"]'>()
  })
})

test('exports package metadata', () => {
  const packageJson = requireFromPackage('groq/package.json') as {version?: unknown}

  expect(packageJson.version).toEqual(expect.any(String))
})
