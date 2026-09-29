import {describe, expect, test} from 'vitest'

import {median, summarize} from '../stats.ts'

describe('median', () => {
  test('odd and even counts', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })

  test('throws on an empty list', () => {
    expect(() => median([])).toThrow('empty')
  })
})

describe('summarize', () => {
  test('computes order statistics', () => {
    expect(summarize([10, 12, 11, 30, 13])).toEqual({
      max: 30,
      median: 12,
      min: 10,
      n: 5,
      p90: 30,
      spread: 1.4826,
    })
  })

  test('a single value has no spread', () => {
    expect(summarize([5])).toEqual({max: 5, median: 5, min: 5, n: 1, p90: 5, spread: 0})
  })

  test('p90 uses the nearest rank', () => {
    expect(summarize([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).p90).toBe(9)
  })

  test('throws on an empty list', () => {
    expect(() => summarize([])).toThrow('empty')
  })
})
