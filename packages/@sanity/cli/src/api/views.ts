/**
 * Output renderers for the `api list` command.
 *
 * The 4-column human table goes through `console-table-printer` (the
 * CLI's existing convention — see `users list`, `tokens list`). The
 * JSON projection is one row per operation.
 */

import {Table} from 'console-table-printer'

import {docsUrlFor} from './docsClient.js'
import {type OperationIndexEntry} from './parser.js'

interface OperationJsonRow {
  capability: string
  docsUrl: string
  endpoint: string
  isStreaming: boolean
  method: string
  operationId: string
  optionalQueryParams: string[]
  pathParams: string[]
  requiredQueryParams: string[]
  spec: string
  summary: string
}

export function toOperationJsonRow(op: OperationIndexEntry): OperationJsonRow {
  return {
    capability: op.capability,
    docsUrl: docsUrlFor(op.spec),
    endpoint: op.endpoint,
    isStreaming: op.isStreaming,
    method: op.method,
    operationId: op.operationId,
    optionalQueryParams: op.optionalQueryParams,
    pathParams: op.pathParams,
    requiredQueryParams: op.requiredQueryParams,
    spec: op.spec,
    summary: op.summary,
  }
}

/**
 * Print operations as a 5-column human table.
 *
 * `OPERATION` (the operationId) is included so a user reading the
 * table can cross-reference into `sanity api spec --operation=<id>`
 * without first re-fetching the JSON form.
 *
 * Writes directly to stdout; does not return a string.
 */
// `console-table-printer`'s `maxLen` only breaks on whitespace —
// `:projectId/.../jobs/{jobId}` endpoints never contain any, so we
// pre-wrap them with `\n`s. Without this, one deeply-nested endpoint
// in the real index (97 chars) sets the column width for the whole
// table and the output overflows any reasonable terminal.
const ENDPOINT_MAX_WIDTH = 45

interface PrintOperationsTableOptions {
  /**
   * Include the OPERATION (operationId) column. Off by default: the
   * id is always present in `--json`, and synthesized ids can be very
   * long (e.g. `delete_organizations_organizationId_providers_...`).
   * Pass `true` when the caller wants the column on screen — e.g.
   * for cross-referencing into `sanity api spec --operation=<id>`.
   */
  showOperationIds?: boolean
}

export function printOperationsTable(
  operations: OperationIndexEntry[],
  options: PrintOperationsTableOptions = {},
): void {
  const columns = [
    {alignment: 'left' as const, name: 'method', title: 'METHOD'},
    {alignment: 'left' as const, name: 'endpoint', title: 'ENDPOINT'},
    {alignment: 'left' as const, name: 'spec', title: 'SPEC'},
    ...(options.showOperationIds
      ? [{alignment: 'left' as const, name: 'operation', title: 'OPERATION'}]
      : []),
    {alignment: 'left' as const, maxLen: 50, name: 'description', title: 'DESCRIPTION'},
  ]
  const table = new Table({columns})

  for (const op of operations) {
    const row: Record<string, string> = {
      description: `${op.summary}${formatTagSuffix(op)}`,
      endpoint: wrapForCell(op.endpoint, ENDPOINT_MAX_WIDTH),
      method: op.method,
      spec: op.spec,
    }
    if (options.showOperationIds) row.operation = op.operationId
    table.addRow(row)
  }

  table.printTable()
}

/**
 * Hard-wrap a no-whitespace string at `width` characters with `\n`s.
 * `console-table-printer` honors embedded newlines as cell line breaks.
 * Breaks prefer separator characters (`/`, `_`, `-`) when one falls in
 * the last ~25% of the line so the wrap doesn't slice through the
 * middle of a path segment / id chunk.
 */
function wrapForCell(value: string, width: number): string {
  if (value.length <= width) return value
  const lines: string[] = []
  let remaining = value
  while (remaining.length > width) {
    // Look for a separator in the back-quarter of the slice to favor
    // segment boundaries. Falls back to a hard slice if none exists.
    const slice = remaining.slice(0, width)
    const minBreakAt = Math.floor(width * 0.75)
    let breakAt = -1
    for (let i = slice.length - 1; i >= minBreakAt; i--) {
      if (/[/_\-.]/.test(slice[i])) {
        breakAt = i + 1
        break
      }
    }
    if (breakAt === -1) breakAt = width
    lines.push(remaining.slice(0, breakAt))
    remaining = remaining.slice(breakAt)
  }
  if (remaining.length > 0) lines.push(remaining)
  return lines.join('\n')
}

function formatTagSuffix(op: OperationIndexEntry): string {
  const tags: string[] = []
  if (op.capability !== 'read') tags.push(op.capability)
  if (op.isStreaming) tags.push('stream')
  return tags.length > 0 ? ` [${tags.join(' ')}]` : ''
}
