const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Parse a user-supplied expiry date or timestamp into an ISO 8601 timestamp
 * @param value - The raw flag or prompt input
 * @returns The normalized timestamp, or an error message describing why the
 * input was rejected
 *
 * @internal
 */
export function parseExpiryDate(value: string): {error: string} | {expiresAt: string} {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return {
      error: `Invalid expiry date "${value}". Pass an ISO 8601 date or timestamp, for example 2027-01-01 or 2027-01-01T12:00:00Z.`,
    }
  }
  if (date.getTime() <= Date.now()) {
    return {error: `Expiry date "${value}" must be in the future.`}
  }
  return {expiresAt: date.toISOString()}
}

/**
 * Get the expiry timestamp a number of days from now
 * @param days - The number of days until expiry
 * @returns An ISO 8601 timestamp
 *
 * @internal
 */
export function expiryInDays(days: number): string {
  return new Date(Date.now() + days * MS_PER_DAY).toISOString()
}
