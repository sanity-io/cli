import {describe, expect, test} from 'vitest'

import {getCjsNamedExports} from '../getCjsNamedExports.js'

describe('getCjsNamedExports', () => {
  test('extracts `exports.X = …` named exports', async () => {
    const source = [
      `'use strict'`,
      `exports.useState = function () {}`,
      `exports.createElement = function () {}`,
      `exports.version = '19.2.0'`,
    ].join('\n')

    const names = await getCjsNamedExports(source, 'react/index')

    expect(names).toEqual(expect.arrayContaining(['useState', 'createElement', 'version']))
    expect(names).toHaveLength(3)
  })

  test('drops `default` and `__esModule`', async () => {
    const source = [
      `Object.defineProperty(exports, '__esModule', { value: true })`,
      `exports.default = {}`,
      `exports.foo = 1`,
    ].join('\n')

    const names = await getCjsNamedExports(source, 'mod')

    expect(names).toEqual(['foo'])
  })

  test('de-duplicates repeated exports and preserves order', async () => {
    const source = `exports.a = 1; exports.a = 2; exports.b = 3;`

    const names = await getCjsNamedExports(source, 'mod')

    expect(names).toEqual(['a', 'b'])
  })

  test('throws on `module.exports = require(…)` re-exports', async () => {
    const source = `module.exports = require('./other.js')`

    let error: unknown
    try {
      await getCjsNamedExports(source, 'react-dom/index')
    } catch (err) {
      error = err
    }

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/re-exports in 'react-dom\/index'/)
  })
})
