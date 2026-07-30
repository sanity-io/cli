import {addDays} from 'date-fns/addDays'
import {format} from 'date-fns/format'
import {isValid} from 'date-fns/isValid'
import {parseISO} from 'date-fns/parseISO'

/**
 * Preset expiry choices offered when creating a token, mirroring the options
 * in the Sanity Manage token creation flow.
 */
export const TOKEN_EXPIRY_PRESET_DAYS = [30, 60, 90] as const

/**
 * Resolve a preset "days from now" choice to a `yyyy-MM-dd` date string
 *
 * @internal
 */
export function getPresetExpiryDate(days: number, now: Date = new Date()): string {
  return format(addDays(now, days), 'yyyy-MM-dd')
}

/**
 * Format a `yyyy-MM-dd` date for display in prompt choices, eg `29 Aug 2026`
 *
 * @internal
 */
export function formatExpiryChoiceDate(date: string): string {
  return format(parseISO(date), 'dd MMM yyyy')
}

/**
 * Validate a user-supplied expiry date. Must be `yyyy-MM-dd` and today or later.
 *
 * @internal
 */
export function validateExpiryDate(value: string, now: Date = new Date()): string | true {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'Use the date format YYYY-MM-DD'
  }
  const parsed = parseISO(value)
  if (!isValid(parsed)) {
    return 'Invalid date'
  }
  if (value < format(now, 'yyyy-MM-dd')) {
    return 'Date must be today or later'
  }
  return true
}

/**
 * Format a token's expiry timestamp for display, or `Never` when unset
 *
 * @internal
 */
export function formatTokenExpiry(expiresAt: string | null | undefined): string {
  if (!expiresAt) {
    return 'Never'
  }
  const parsed = new Date(expiresAt)
  return isValid(parsed) ? format(parsed, 'yyyy-MM-dd') : expiresAt
}
