import {afterAll, beforeAll, describe, expect, test, vi} from 'vitest'

import {
  formatDateTime,
  formatDuration,
  formatElapsed,
  formatTimeAgo,
  parseDateOnly,
} from '../dates.js'

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

  test('accepts epoch milliseconds', () => {
    expect(formatDateTime(Date.parse('2024-01-15T10:30:00Z'))).toBe('2024-01-15 10:30:00')
  })

  test('accepts a Date', () => {
    expect(formatDateTime(new Date('2024-01-15T10:30:00Z'))).toBe('2024-01-15 10:30:00')
  })

  test('returns an empty string for an invalid Date or a non-finite number', () => {
    expect(formatDateTime(new Date('nope'))).toBe('')
    expect(formatDateTime(Number.NaN)).toBe('')
    expect(formatDateTime(Number.POSITIVE_INFINITY)).toBe('')
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

  test.each([
    [59.6 * MINUTE, '1 hour'],
    [23.6 * HOUR, '1 day'],
    [6.6 * DAY, '1 week'],
    [29.9 * DAY, '1 month'],
    [350 * DAY, '1 year'],
  ])('promotes %ims rather than rounding up to the next unit ("%s")', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected)
  })

  test('stays just below each promotion boundary', () => {
    expect(formatDuration(59.4 * MINUTE)).toBe('59 minutes')
    expect(formatDuration(23.4 * HOUR)).toBe('23 hours')
    expect(formatDuration(6.4 * DAY)).toBe('6 days')
    expect(formatDuration(24 * DAY)).toBe('3 weeks')
    expect(formatDuration(340 * DAY)).toBe('11 months')
  })

  test('ignores the direction of the duration', () => {
    expect(formatDuration(-5 * MINUTE)).toBe('5 minutes')
  })

  test('returns an empty string for a non-finite duration', () => {
    expect(formatDuration(Number.NaN)).toBe('')
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('')
  })
})

describe('formatElapsed', () => {
  test.each([
    [0, '0ms'],
    [450, '450ms'],
    [999, '999ms'],
    [SECOND, '1s'],
    [5 * SECOND, '5s'],
    [59 * SECOND + 999, '59s'],
    [MINUTE, '1m 0s'],
    [MINUTE + 5 * SECOND, '1m 5s'],
    [90 * SECOND, '1m 30s'],
    [59 * MINUTE + 59 * SECOND, '59m 59s'],
    [HOUR, '1h 0m'],
    [HOUR + MINUTE, '1h 1m'],
    [2 * HOUR + 5 * MINUTE, '2h 5m'],
    [23 * HOUR + 59 * MINUTE, '23h 59m'],
    [DAY, '1d 0h'],
    [3 * DAY + 7 * HOUR, '3d 7h'],
    [10 * DAY, '10d 0h'],
  ])('formats %ims as "%s"', (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected)
  })

  test('truncates rather than rounds once past a second', () => {
    expect(formatElapsed(5 * SECOND + 900)).toBe('5s')
    expect(formatElapsed(MINUTE + 59 * SECOND + 900)).toBe('1m 59s')
  })

  test('rounds fractional milliseconds', () => {
    expect(formatElapsed(450.4)).toBe('450ms')
    expect(formatElapsed(450.6)).toBe('451ms')
  })

  test('ignores the direction of the elapsed time', () => {
    expect(formatElapsed(-90 * SECOND)).toBe('1m 30s')
  })

  test('returns an empty string for a non-finite elapsed time', () => {
    expect(formatElapsed(Number.NaN)).toBe('')
    expect(formatElapsed(Number.POSITIVE_INFINITY)).toBe('')
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

  test.each([
    [-59.7 * SECOND, '1 minute ago'],
    [-59.6 * MINUTE, '1 hour ago'],
    [-23.6 * HOUR, '1 day ago'],
    [59.7 * SECOND, 'in 1 minute'],
    [23.6 * HOUR, 'in 1 day'],
  ])('promotes an offset of %ims rather than rounding up ("%s")', (offset, expected) => {
    expect(formatTimeAgo(new Date(now + offset), now)).toBe(expected)
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
