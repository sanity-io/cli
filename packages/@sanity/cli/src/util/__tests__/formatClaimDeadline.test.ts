import {describe, expect, test} from 'vitest'

import {formatClaimDeadline, formatClaimTimeLeft} from '../formatClaimDeadline.js'

describe('formatClaimDeadline', () => {
  test('formats the deadline in UTC', () => {
    expect(formatClaimDeadline('2026-07-31T10:30:00.000Z')).toBe('31 July 2026, 10:30 UTC')
  })

  test('preserves an invalid deadline', () => {
    expect(formatClaimDeadline('invalid')).toBe('invalid')
  })
})

describe('formatClaimTimeLeft', () => {
  test('formats remaining whole hours and minutes', () => {
    expect(formatClaimTimeLeft(13 * 60 * 60 * 1000 + 30 * 60 * 1000 + 59 * 1000)).toBe('13h 30m')
  })

  test('does not show a negative duration', () => {
    expect(formatClaimTimeLeft(-1)).toBe('0h 00m')
  })
})
