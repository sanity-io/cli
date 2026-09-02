import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {expiryInDays, parseExpiryDate} from '../expiry.js'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('parseExpiryDate', () => {
  test('normalizes a date to an ISO 8601 timestamp', () => {
    expect(parseExpiryDate('2030-01-01')).toEqual({expiresAt: '2030-01-01T00:00:00.000Z'})
  })

  test('accepts a full timestamp', () => {
    expect(parseExpiryDate('2030-01-01T12:30:00Z')).toEqual({
      expiresAt: '2030-01-01T12:30:00.000Z',
    })
  })

  test('rejects an unparseable value', () => {
    expect(parseExpiryDate('not-a-date')).toEqual({
      error:
        'Invalid expiry date "not-a-date". Pass an ISO 8601 date or timestamp, for example 2027-01-01 or 2027-01-01T12:00:00Z.',
    })
  })

  test('rejects a date in the past', () => {
    expect(parseExpiryDate('2020-01-01')).toEqual({
      error: 'Expiry date "2020-01-01" must be in the future.',
    })
  })

  test('rejects the current instant', () => {
    expect(parseExpiryDate('2026-01-01T00:00:00.000Z')).toEqual({
      error: 'Expiry date "2026-01-01T00:00:00.000Z" must be in the future.',
    })
  })
})

describe('expiryInDays', () => {
  test('returns the timestamp the given number of days from now', () => {
    expect(expiryInDays(30)).toBe('2026-01-31T00:00:00.000Z')
    expect(expiryInDays(90)).toBe('2026-04-01T00:00:00.000Z')
  })
})
