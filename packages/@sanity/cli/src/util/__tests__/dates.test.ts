import {afterAll, beforeAll, describe, expect, test, vi} from 'vitest'

import {formatDateTime, formatDuration, formatTimeAgo, parseDateOnly} from '../dates.js'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

describe('formatDateTime', () => {
  beforeAll(() => {
    vi.stubEnv('TZ', 'UTC')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  test('formats an ISO timestamp as `YYYY-MM-DD HH:mm:ss`', () => {
    expect(formatDateTime('2024-01-15T10:30:00Z')).toBe('2024-01-15 10:30:00')
  })

  test('zero pads every component', () => {
    expect(formatDateTime('2024-02-05T04:03:09Z')).toBe('2024-02-05 04:03:09')
  })

  test('renders in the local time zone', () => {
    expect(formatDateTime('2024-01-15T23:30:00+02:00')).toBe('2024-01-15 21:30:00')
  })

  test('drops sub-second precision', () => {
    expect(formatDateTime('2024-01-15T10:30:00.987Z')).toBe('2024-01-15 10:30:00')
  })

  test('returns the input unchanged when it cannot be parsed', () => {
    expect(formatDateTime('not a date')).toBe('not a date')
    expect(formatDateTime('')).toBe('')
  })
})

describe('formatDuration', () => {
  test.each([
    [0, 'less than a minute'],
    [999, 'less than a minute'],
    [30 * SECOND, 'less than a minute'],
    [MINUTE, '1 minute'],
    [5 * MINUTE, '5 minutes'],
    [59 * MINUTE, '59 minutes'],
    [HOUR, '1 hour'],
    [5 * HOUR, '5 hours'],
    [DAY, '1 day'],
    [3 * DAY, '3 days'],
    [WEEK, '1 week'],
    [3 * WEEK, '3 weeks'],
    [45 * DAY, '2 months'],
    [400 * DAY, '1 year'],
  ])('formats %ims as "%s"', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected)
  })

  test('rounds to the nearest unit', () => {
    expect(formatDuration(89 * SECOND)).toBe('1 minute')
    expect(formatDuration(91 * SECOND)).toBe('2 minutes')
  })

  test('ignores the direction of the duration', () => {
    expect(formatDuration(-5 * MINUTE)).toBe('5 minutes')
  })

  test('returns an empty string for a non-finite duration', () => {
    expect(formatDuration(Number.NaN)).toBe('')
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('')
  })
})

describe('formatTimeAgo', () => {
  const now = Date.parse('2024-06-15T12:00:00Z')

  test.each([
    [0, 'just now'],
    [-500, 'just now'],
    [-SECOND, '1 second ago'],
    [-30 * SECOND, '30 seconds ago'],
    [-2 * MINUTE, '2 minutes ago'],
    [-3 * HOUR, '3 hours ago'],
    [-DAY, '1 day ago'],
    [-4 * DAY, '4 days ago'],
    [-2 * WEEK, '2 weeks ago'],
    [-90 * DAY, '3 months ago'],
    [-800 * DAY, '2 years ago'],
  ])('describes an offset of %ims as "%s"', (offset, expected) => {
    expect(formatTimeAgo(new Date(now + offset), now)).toBe(expected)
  })

  test('describes future dates', () => {
    expect(formatTimeAgo(new Date(now + 3 * HOUR), now)).toBe('in 3 hours')
  })

  test('defaults the reference point to the current time', () => {
    expect(formatTimeAgo(new Date(Date.now() - 2 * HOUR))).toBe('2 hours ago')
  })

  test('returns an empty string for an invalid date', () => {
    expect(formatTimeAgo(new Date('nope'), now)).toBe('')
  })
})

describe('parseDateOnly', () => {
  test('parses a YYYY-MM-DD date to local midnight', () => {
    const parsed = parseDateOnly('2024-01-31')

    expect(parsed?.getFullYear()).toBe(2024)
    expect(parsed?.getMonth()).toBe(0)
    expect(parsed?.getDate()).toBe(31)
    expect(parsed?.getHours()).toBe(0)
    expect(parsed?.getMinutes()).toBe(0)
  })

  test('accepts leap days', () => {
    expect(parseDateOnly('2024-02-29')?.getDate()).toBe(29)
  })

  test.each([
    ['2024-02-30', 'a day that does not exist in the month'],
    ['2023-02-29', 'a leap day in a non-leap year'],
    ['2024-13-01', 'an out of range month'],
    ['2024-00-10', 'a zero month'],
    ['2024-01-00', 'a zero day'],
    ['2024-1-5', 'unpadded components'],
    ['2024-01-15T10:00:00Z', 'a full timestamp'],
    ['2024-01-15 ', 'trailing whitespace'],
    ['invalid-date', 'a non-date string'],
    ['', 'an empty string'],
  ])('rejects %s (%s)', (value) => {
    expect(parseDateOnly(value)).toBeUndefined()
  })
})
