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
    pathParams: op.pathParams,
    requiredQueryParams: op.requiredQueryParams,
    spec: op.spec,
    summary: op.summary,
  }
}

/**
 * Print operations as a 4-column human table.
 * Writes directly to stdout; does not return a string.
 */
export function printOperationsTable(operations: OperationIndexEntry[]): void {
  const table = new Table({
    columns: [
      {alignment: 'left', name: 'method', title: 'METHOD'},
      {alignment: 'left', name: 'endpoint', title: 'ENDPOINT'},
      {alignment: 'left', name: 'spec', title: 'SPEC'},
      {alignment: 'left', name: 'description', title: 'DESCRIPTION'},
    ],
  })

  for (const op of operations) {
    table.addRow({
      description: `${op.summary}${formatTagSuffix(op)}`,
      endpoint: op.endpoint,
      method: op.method,
      spec: op.spec,
    })
  }

  table.printTable()
}

function formatTagSuffix(op: OperationIndexEntry): string {
  const tags: string[] = []
  if (op.capability !== 'read') tags.push(op.capability)
  if (op.isStreaming) tags.push('stream')
  return tags.length > 0 ? ` [${tags.join(' ')}]` : ''
}
