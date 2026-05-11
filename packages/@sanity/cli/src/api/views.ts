/**
 * Output renderers for the `api list` and `api spec` commands.
 *
 * - `list` view: a 4-column operations table (human) + a per-row JSON projection (machine).
 * - `spec` view: a per-spec human render (header + per-operation blocks) + a structured JSON view.
 *
 * Two distinct JSON shapes by design. The list-view row stands alone (it
 * needs `spec` + `docsUrl` per entry). The spec-view operation is nested
 * under a single spec envelope, so those fields would be redundant.
 */

import {Table} from 'console-table-printer'

import {type OpenApiSpecIndexEntry} from './docsClient.js'
import {type OperationIndexEntry, type ParsedOperation, type ParsedSpec} from './parser.js'

const HTTP_REFERENCE_BASE_URL = 'https://www.sanity.io/docs/http-reference'
const HUMAN_SEPARATOR = '─'.repeat(72)

/* ---------------------------------------------------------------------- *
 *  list view                                                              *
 * ---------------------------------------------------------------------- */

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
    docsUrl: `${HTTP_REFERENCE_BASE_URL}/${op.spec}`,
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
 * Print operations as a 4-column human table via `console-table-printer`
 * (the CLI's table convention — see `users list`, `tokens list`, etc.).
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

/* ---------------------------------------------------------------------- *
 *  spec view                                                              *
 * ---------------------------------------------------------------------- */

interface OperationJsonView {
  capability: string
  endpoint: string
  isStreaming: boolean
  method: string
  operationId: string
  pathParams: string[]
  requiredQueryParams: string[]
  summary: string
}

interface SpecJsonView {
  description: string
  docsUrl: string
  operations: OperationJsonView[]
  spec: string
  title: string
  version: string
}

export function buildSpecJsonView(
  slug: string,
  entry: OpenApiSpecIndexEntry | undefined,
  parsed: ParsedSpec,
  operations: ParsedOperation[],
): SpecJsonView {
  return {
    description: entry?.description || parsed.description,
    docsUrl: `${HTTP_REFERENCE_BASE_URL}/${slug}`,
    operations: operations.map((op) => toOperationJsonView(op)),
    spec: slug,
    title: entry?.title || parsed.title || slug,
    version: parsed.version,
  }
}

function toOperationJsonView(op: ParsedOperation): OperationJsonView {
  return {
    capability: op.capability,
    endpoint: op.endpoint,
    isStreaming: op.isStreaming,
    method: op.method,
    operationId: op.operationId,
    pathParams: op.pathParams,
    requiredQueryParams: op.requiredQueryParams,
    summary: op.summary,
  }
}

/**
 * Render a spec as a human-readable structured view.
 *
 * Spec header (title + version + docs link), then one block per
 * operation: method, endpoint, operationId, capability tags, summary,
 * path / required-query params.
 */
export function renderSpecHumanView(
  slug: string,
  entry: OpenApiSpecIndexEntry | undefined,
  parsed: ParsedSpec,
  operations: ParsedOperation[],
): string {
  const title = entry?.title || parsed.title || slug
  const description = entry?.description || parsed.description
  const docsUrl = `${HTTP_REFERENCE_BASE_URL}/${slug}`

  const header = [`${title}${parsed.version ? ` — ${parsed.version}` : ''}`]
  if (description) header.push(description)
  header.push(`Docs: ${docsUrl}`, '')

  if (operations.length === 0) {
    return [...header, '(no operations)'].join('\n')
  }

  const opBlocks = operations.flatMap((op) => renderOperationBlock(op))
  return [...header, ...opBlocks].join('\n')
}

function renderOperationBlock(op: ParsedOperation): string[] {
  const tags = [op.capability, ...(op.isStreaming ? ['stream'] : [])].join(' · ')
  const opIdLabel = op.operationId || '(no operationId)'

  return [
    HUMAN_SEPARATOR,
    `${op.method}  ${op.endpoint}  ·  ${opIdLabel}  ·  ${tags}`,
    ...(op.summary ? [op.summary] : []),
    '',
    '  Path params:',
    ...renderParamList(op.pathParams),
    '',
    '  Query params (required):',
    ...renderParamList(op.requiredQueryParams),
    '',
  ]
}

function renderParamList(names: string[]): string[] {
  if (names.length === 0) return ['    (none)']
  return names.map((name) => `    ${name}`)
}
