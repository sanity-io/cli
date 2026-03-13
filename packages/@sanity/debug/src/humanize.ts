const SECOND = 1000
const MINUTE = SECOND * 60
const HOUR = MINUTE * 60
const DAY = HOUR * 24

/**
 * Convert milliseconds to a human-readable string.
 * Only handles number-to-string direction (no parsing).
 *
 * @internal
 */
export function humanize(ms: number): string {
  const abs = Math.abs(ms)

  if (abs < SECOND) return `${abs}ms`
  if (abs < MINUTE) return `${round(abs / SECOND)}s`
  if (abs < HOUR) return `${round(abs / MINUTE)}m`
  if (abs < DAY) return `${round(abs / HOUR)}h`
  return `${round(abs / DAY)}d`
}

function round(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return rounded % 1 === 0 ? String(rounded) : String(rounded)
}
