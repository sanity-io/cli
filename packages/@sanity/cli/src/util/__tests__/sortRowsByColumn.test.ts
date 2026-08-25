import {describe, expect, test} from 'vitest'

import {sortRowsByColumn} from '../sortRowsByColumn.js'

describe('sortRowsByColumn', () => {
  test('sorts rows ascending by the given column', () => {
    const rows = [
      ['c', '3'],
      ['a', '1'],
      ['b', '2'],
    ]

    expect(sortRowsByColumn(rows, 0)).toEqual([
      ['a', '1'],
      ['b', '2'],
      ['c', '3'],
    ])
  })

  test('sorts by a column other than the first', () => {
    const rows = [
      ['a', 'z'],
      ['b', 'x'],
      ['c', 'y'],
    ]

    expect(sortRowsByColumn(rows, 1)).toEqual([
      ['b', 'x'],
      ['c', 'y'],
      ['a', 'z'],
    ])
  })

  test('does not mutate the input', () => {
    const rows = [['b'], ['a']]
    const sorted = sortRowsByColumn(rows, 0)

    expect(rows).toEqual([['b'], ['a']])
    expect(sorted).not.toBe(rows)
  })

  test('compares as strings, so numeric columns order lexicographically', () => {
    const rows = [['9'], ['10'], ['1']]

    expect(sortRowsByColumn(rows, 0)).toEqual([['1'], ['10'], ['9']])
  })

  test('is case sensitive, ordering uppercase before lowercase', () => {
    const rows = [['apple'], ['Banana'], ['Apple']]

    expect(sortRowsByColumn(rows, 0)).toEqual([['Apple'], ['Banana'], ['apple']])
  })

  test('keeps the original order of rows that tie', () => {
    const rows = [
      ['same', 'second'],
      ['same', 'first'],
      ['other', 'third'],
    ]

    expect(sortRowsByColumn(rows, 0)).toEqual([
      ['other', 'third'],
      ['same', 'second'],
      ['same', 'first'],
    ])
  })

  test('leaves rows untouched for an out-of-range column', () => {
    const rows = [['b'], ['a'], ['c']]

    expect(sortRowsByColumn(rows, -1)).toEqual([['b'], ['a'], ['c']])
    expect(sortRowsByColumn(rows, 5)).toEqual([['b'], ['a'], ['c']])
  })

  test('handles empty input', () => {
    expect(sortRowsByColumn([], 0)).toEqual([])
  })
})
