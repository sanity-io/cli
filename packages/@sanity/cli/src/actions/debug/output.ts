import {inspect, styleText} from 'node:util'

export function sectionHeader(title: string): string {
  return styleText('bold', `${title}:`)
}

export function formatKeyValue(
  key: string,
  value: unknown,
  options?: {indent?: number; padTo?: number},
): string {
  const indent = options?.indent ?? 2
  const padTo = options?.padTo ?? 0
  const paddedKey = `${key}:`.padEnd(padTo > 0 ? padTo + 1 : key.length + 1)
  const formattedValue = formatValue(value)
  return `${' '.repeat(indent)}${styleText('dim', paddedKey)} ${formattedValue}`
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[ ${value.map((v) => JSON.stringify(v)).join(', ')} ]`
  }
  if (typeof value === 'string') {
    return value
  }
  return inspect(value, {colors: true, depth: Infinity})
}
