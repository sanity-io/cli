import {formatKeyValue} from '../debug/output.js'
import {humanize} from './operationInput.js'
import {contextTable} from './table.js'

const AUTO_COLUMNS = 6

type Row = Record<string, unknown>

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isScalar(value: unknown): boolean {
  return value === null || ['boolean', 'number', 'string'].includes(typeof value)
}

/**
 * A value on one line: `-` for nothing, a comma list for an array,
 * `id (status)` for an object with an ID, and `Key: value` pairs for any
 * other object
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value))
    return value.length === 0 ? '-' : value.map((item) => cell(item)).join(', ')
  if (isRow(value)) {
    if (typeof value.id === 'string') {
      return typeof value.status === 'string' ? `${value.id} (${value.status})` : value.id
    }
    const entries = Object.entries(value).filter(([, item]) => item !== undefined)
    if (entries.length === 0) return '-'
    return entries.map(([key, item]) => `${humanize(key)}: ${cell(item)}`).join('; ')
  }
  return JSON.stringify(value)
}

function renderTable(rows: readonly unknown[], columns?: readonly string[]): string {
  if (rows.length === 0) return 'No results'
  const first = rows.find((row) => isRow(row)) ?? {}
  const names =
    columns ??
    Object.entries(first)
      .filter(([, value]) => isScalar(value))
      .map(([name]) => name)
      .slice(0, AUTO_COLUMNS)
  const table = contextTable({
    columns: names.map((name) => ({alignment: 'left', name, title: humanize(name)})),
  })
  for (const row of rows) {
    if (!isRow(row)) continue
    table.addRow(Object.fromEntries(names.map((name) => [name, cell(row[name])])))
  }
  return table.render()
}

function renderObject(row: Row): string {
  const entries = Object.entries(row)
  const padTo = Math.max(...entries.map(([key]) => humanize(key).length))
  return entries
    .map(([key, value]) => formatKeyValue(humanize(key), cell(value), {padTo}))
    .join('\n')
}

/**
 * A response as terminal output: a table for a list, key-value lines for an
 * object, the text of a text response, and a confirmation for no content
 */
export function renderOperationResult(
  result: unknown,
  options: {columns?: readonly string[]; summary: string},
): string {
  if (result === undefined || result === null || result === '') return `${options.summary}: done`
  if (typeof result === 'string') return result
  if (Array.isArray(result)) return renderTable(result, options.columns)
  if (isRow(result)) return renderObject(result)
  return cell(result)
}
