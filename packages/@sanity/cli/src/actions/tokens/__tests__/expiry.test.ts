import {describe, expect, test} from 'vitest'

import {
  formatExpiryChoiceDate,
  formatTokenExpiry,
  getPresetExpiryDate,
  TOKEN_EXPIRY_PRESET_DAYS,
  validateExpiryDate,
} from '../expiry.js'

describe('tokens expiry helpers', () => {
  test('exposes the same preset choices as the Manage token creation flow', () => {
    expect(TOKEN_EXPIRY_PRESET_DAYS).toEqual([30, 60, 90])
  })

  test('getPresetExpiryDate resolves days from now to a yyyy-MM-dd date', () => {
    const now = new Date('2026-07-30T12:00:00Z')
    expect(getPresetExpiryDate(30, now)).toBe('2026-08-29')
    expect(getPresetExpiryDate(60, now)).toBe('2026-09-28')
    expect(getPresetExpiryDate(90, now)).toBe('2026-10-28')
  })

  test('formatExpiryChoiceDate formats dates for prompt choices', () => {
    expect(formatExpiryChoiceDate('2026-08-29')).toBe('29 Aug 2026')
  })

  describe('validateExpiryDate', () => {
    const now = new Date('2026-07-30T12:00:00Z')

    test('accepts today and future dates', () => {
      expect(validateExpiryDate('2026-07-30', now)).toBe(true)
      expect(validateExpiryDate('2026-08-01', now)).toBe(true)
      expect(validateExpiryDate('2030-01-01', now)).toBe(true)
    })

    test('rejects malformed values', () => {
      expect(validateExpiryDate('soon', now)).toBe('Use the date format YYYY-MM-DD')
      expect(validateExpiryDate('30-07-2026', now)).toBe('Use the date format YYYY-MM-DD')
      expect(validateExpiryDate('2026-7-30', now)).toBe('Use the date format YYYY-MM-DD')
      expect(validateExpiryDate('', now)).toBe('Use the date format YYYY-MM-DD')
    })

    test('rejects impossible dates', () => {
      expect(validateExpiryDate('2026-13-01', now)).toBe('Invalid date')
      expect(validateExpiryDate('2026-02-30', now)).toBe('Invalid date')
    })

    test('rejects past dates', () => {
      expect(validateExpiryDate('2026-07-29', now)).toBe('Date must be today or later')
      expect(validateExpiryDate('2020-01-01', now)).toBe('Date must be today or later')
    })
  })

  describe('formatTokenExpiry', () => {
    test('formats timestamps as dates', () => {
      expect(formatTokenExpiry('2026-12-31T00:00:00.000Z')).toBe('2026-12-31')
    })

    test('shows Never when unset', () => {
      expect(formatTokenExpiry(null)).toBe('Never')
      expect(formatTokenExpiry(undefined)).toBe('Never')
      expect(formatTokenExpiry('')).toBe('Never')
    })

    test('falls back to the raw value for unparseable dates', () => {
      expect(formatTokenExpiry('not-a-date')).toBe('not-a-date')
    })
  })
})
