import {describe, expect, test} from 'vitest'

import {humanize} from '../humanize.js'

describe('humanize', () => {
  test('returns "0ms" for 0', () => {
    expect(humanize(0)).toBe('0ms')
  })

  test('returns milliseconds for values < 1000', () => {
    expect(humanize(1)).toBe('1ms')
    expect(humanize(500)).toBe('500ms')
    expect(humanize(999)).toBe('999ms')
  })

  test('returns seconds for values < 60s', () => {
    expect(humanize(1000)).toBe('1s')
    expect(humanize(1500)).toBe('1.5s')
    expect(humanize(5432)).toBe('5.4s')
    expect(humanize(59_999)).toBe('60s')
  })

  test('returns minutes for values < 1h', () => {
    expect(humanize(60_000)).toBe('1m')
    expect(humanize(90_000)).toBe('1.5m')
    expect(humanize(3_599_999)).toBe('60m')
  })

  test('returns hours for values < 1d', () => {
    expect(humanize(3_600_000)).toBe('1h')
    expect(humanize(5_400_000)).toBe('1.5h')
  })

  test('returns days for values >= 1d', () => {
    expect(humanize(86_400_000)).toBe('1d')
    expect(humanize(129_600_000)).toBe('1.5d')
  })

  test('handles negative values as absolute', () => {
    expect(humanize(-500)).toBe('500ms')
  })
})
