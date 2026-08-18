import {pluralize} from './pluralize.js'

const MS_IN = {
  day: 86_400_000,
  hour: 3_600_000,
  minute: 60_000,
  month: 2_592_000_000, // 30 days
  second: 1000,
  week: 604_800_000,
  year: 31_536_000_000, // 365 days
} as const

/** Largest unit first, so the first unit the duration fills is the one we report. */
const UNITS: {ms: number; unit: Intl.RelativeTimeFormatUnit}[] = [
  {ms: MS_IN.year, unit: 'year'},
  {ms: MS_IN.month, unit: 'month'},
  {ms: MS_IN.week, unit: 'week'},
  {ms: MS_IN.day, unit: 'day'},
  {ms: MS_IN.hour, unit: 'hour'},
  {ms: MS_IN.minute, unit: 'minute'},
  {ms: MS_IN.second, unit: 'second'},
]

const relativeTime = new Intl.RelativeTimeFormat('en', {numeric: 'always'})

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

/**
 * Returns the coarsest unit the elapsed time fills and the rounded number of those
 * units, or `undefined` below a second.
 *
 * Rounding can land the value on the boundary of the next unit up, so we promote
 * rather than report `60 minutes` where `1 hour` is meant. Units aren't all whole
 * multiples of each other, so the boundary is the rounded count we'd display, which
 * is why 25+ days reads as `1 month` rather than `4 weeks`.
 */
function selectUnit(
  elapsed: number,
): {unit: Intl.RelativeTimeFormatUnit; value: number} | undefined {
  let index = UNITS.findIndex(({ms}) => elapsed >= ms)
  if (index === -1) return undefined

  while (
    index > 0 &&
    Math.round(elapsed / UNITS[index].ms) >= Math.round(UNITS[index - 1].ms / UNITS[index].ms)
  ) {
    index -= 1
  }

  const {ms, unit} = UNITS[index]
  return {unit, value: Math.round(elapsed / ms)}
}

/**
 * Formats a timestamp as `YYYY-MM-DD HH:mm:ss` in the local time zone. Unparseable
 * timestamps are returned as-is, so a bad value from the API doesn't fail the command.
 *
 * @param timestamp - An ISO 8601 timestamp
 * @internal
 */
export function formatDateTime(timestamp: string): string {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return timestamp

  const day = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  return `${day} ${time}`
}

/**
 * Formats a duration in milliseconds as an approximate, human readable length of
 * time, eg `less than a minute`, `5 minutes` or `2 days`.
 *
 * @param ms - The duration in milliseconds
 * @internal
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return ''

  const selected = selectUnit(Math.abs(ms))
  if (!selected || selected.unit === 'second') return 'less than a minute'

  return `${selected.value} ${pluralize(selected.unit, selected.value)}`
}

/**
 * Formats a date relative to now, eg `2 days ago` or `in 3 hours`.
 *
 * @param date - The date to describe
 * @param now - The reference point to compare against, defaults to the current time
 * @internal
 */
export function formatTimeAgo(date: Date, now: number = Date.now()): string {
  const delta = date.getTime() - now
  if (!Number.isFinite(delta)) return ''

  const selected = selectUnit(Math.abs(delta))
  if (!selected) return 'just now'

  return relativeTime.format(delta < 0 ? -selected.value : selected.value, selected.unit)
}

/**
 * Parses a `YYYY-MM-DD` date into a `Date` at local midnight. Returns `undefined`
 * for anything that isn't a real calendar date in that exact format.
 *
 * @param value - The date string to parse
 * @internal
 */
export function parseDateOnly(value: string): Date | undefined {
  const match = DATE_ONLY_PATTERN.exec(value)
  if (!match) return undefined

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  // `new Date(2024, 1, 31)` silently rolls over into March, so reject anything
  // that didn't survive the round trip
  const isRoundTrip =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day

  return isRoundTrip ? date : undefined
}
