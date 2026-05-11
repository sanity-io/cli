/**
 * Output renderers for the `api list` and `api spec` commands.
 *
 * - `list` view: a 4-column operations table (human) + a per-row JSON projection (machine).
 * - `spec` view: a per-spec human render (header + per-operation blocks) + a structured JSON view.
 *
 * Two distinct JSON shapes by design. The list-view row stands alone (it
 * needs `spec` + `docsUrl` per entry). The spec-view operation is nested
 * under a single spec envelope, so those fields would be redundant.
 *
 * `$ref` policy in JSON output: we **link, never resolve**. Body fields
 * and response schemas carry `ref: '<schemaName>'` when they point at
 * `components.schemas.<schemaName>`. Agents follow up with
 * `sanity api spec <slug> --schema <name>` rather than receiving a
 * pre-expanded tree (avoids depth caps, cycle handling, payload bloat).
 */

import {Table} from 'console-table-printer'

import {type OpenApiSpecIndexEntry} from './docsClient.js'
import {
  type OperationIndexEntry,
  type ParsedBodyField,
  type ParsedOperation,
  type ParsedParam,
  type ParsedRequestBody,
  type ParsedResponse,
  type ParsedSpec,
} from './parser.js'

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
  /** Names only — the rich shape lives in `sanity api spec`. */
  pathParams: string[]
  /** Names only — query params are split required/optional in the spec view. */
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
    pathParams: op.pathParams.map((p) => p.name),
    requiredQueryParams: op.queryParams.filter((p) => p.required).map((p) => p.name),
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
 *  spec view (JSON)                                                       *
 * ---------------------------------------------------------------------- */

interface OperationJsonView {
  capability: string
  description: string
  endpoint: string
  headerParams: ParsedParam[]
  isStreaming: boolean
  method: string
  operationId: string
  pathParams: ParsedParam[]
  queryParams: ParsedParam[]
  requestBody: ParsedRequestBody | null
  responses: ParsedResponse[]
  security: {scheme: string}[]
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
    description: op.description,
    endpoint: op.endpoint,
    headerParams: op.headerParams,
    isStreaming: op.isStreaming,
    method: op.method,
    operationId: op.operationId,
    pathParams: op.pathParams,
    queryParams: op.queryParams,
    requestBody: op.requestBody,
    responses: op.responses,
    security: op.security,
    summary: op.summary,
  }
}

/* ---------------------------------------------------------------------- *
 *  spec view (human)                                                      *
 * ---------------------------------------------------------------------- */

/**
 * Render a spec as a human-readable structured view.
 *
 * Spec header (title + version + docs link), then one block per
 * operation: method, endpoint, operationId, capability tags, summary,
 * params (typed columns with descriptions), request body, responses,
 * security, plus a hint for following any `$ref` pointers via
 * `sanity api spec <slug> --schema <name>`.
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

  const opBlocks = operations.flatMap((op) => renderOperationBlock(op, slug))
  return [...header, ...opBlocks].join('\n')
}

function renderOperationBlock(op: ParsedOperation, slug: string): string[] {
  const tags = [op.capability, ...(op.isStreaming ? ['stream'] : [])].join(' · ')
  const opIdLabel = op.operationId || '(no operationId)'
  const summaryLine = op.summary || op.description
  const requiredQueryParams = op.queryParams.filter((p) => p.required)
  const optionalQueryParams = op.queryParams.filter((p) => !p.required)
  const allRefs = collectRefs(op)

  const lines: string[] = [
    HUMAN_SEPARATOR,
    `${op.method}  ${op.endpoint}  ·  ${opIdLabel}  ·  ${tags}`,
    ...(summaryLine ? [summaryLine] : []),
    '',
  ]

  appendParamSection(lines, 'Path params', op.pathParams)
  appendParamSection(lines, 'Query params (required)', requiredQueryParams)
  if (optionalQueryParams.length > 0) {
    appendParamSection(lines, 'Query params (optional)', optionalQueryParams)
  }
  if (op.headerParams.length > 0) {
    appendParamSection(lines, 'Header params', op.headerParams)
  }

  if (op.requestBody) {
    appendBodySection(lines, op.requestBody)
  }

  appendResponsesSection(lines, op.responses)

  if (op.security.length > 0) {
    lines.push(`  Auth: ${op.security.map((s) => s.scheme).join(', ')}`, '')
  }

  if (allRefs.length > 0) {
    lines.push(
      `  Schemas referenced: ${allRefs.join(', ')}`,
      `  Resolve any: sanity api spec ${slug} --schema <name>`,
      '',
    )
  }

  return lines
}

function appendParamSection(lines: string[], title: string, params: ParsedParam[]): void {
  lines.push(`  ${title}:`)
  if (params.length === 0) {
    lines.push('    (none)', '')
    return
  }
  for (const p of params) {
    lines.push(`    ${formatParamLine(p)}`)
    if (p.description) lines.push(`      ${p.description}`)
    if (p.enum) lines.push(`      enum: ${p.enum.join(' | ')}`)
    if (p.default !== undefined) lines.push(`      default: ${formatValue(p.default)}`)
    if (p.example !== undefined) lines.push(`      example: ${formatValue(p.example)}`)
  }
  lines.push('')
}

function formatParamLine(p: ParsedParam): string {
  const req = p.required ? 'required' : 'optional'
  return `${p.name}  ${p.type}  ${req}`
}

function appendBodySection(lines: string[], body: ParsedRequestBody): void {
  const required = body.required ? 'required' : 'optional'
  lines.push(`  Request body (${body.contentType}, ${required}):`)
  if (body.schemaSummary && body.fields.length === 0) {
    lines.push(`    ${body.schemaSummary}`)
  }
  for (const field of body.fields) {
    appendBodyField(lines, field, 1)
  }
  if (body.refs.length > 0) {
    lines.push(`    refs: ${body.refs.join(', ')}`)
  }
  if (body.fields.length === 0 && !body.schemaSummary && body.refs.length === 0) {
    lines.push('    (no schema)')
  }
  lines.push('')
}

function appendBodyField(lines: string[], field: ParsedBodyField, depth: number): void {
  const indent = '    '.repeat(depth)
  const req = field.required ? 'required' : 'optional'
  const refSuffix = field.ref ? ` → ${field.ref}` : ''
  lines.push(`${indent}${field.name}  ${field.type}  ${req}${refSuffix}`)
  if (field.description) lines.push(`${indent}  ${field.description}`)
  if (field.enum) lines.push(`${indent}  enum: ${field.enum.join(' | ')}`)
  if (field.default !== undefined) {
    lines.push(`${indent}  default: ${formatValue(field.default)}`)
  }
  for (const child of field.fields) {
    appendBodyField(lines, child, depth + 1)
  }
}

function appendResponsesSection(lines: string[], responses: ParsedResponse[]): void {
  if (responses.length === 0) return
  lines.push('  Responses:')
  for (const r of responses) {
    const status = r.status === 0 ? 'default' : String(r.status)
    const contentType = r.contentType || '—'
    const summary = r.schemaSummary ? `  ${r.schemaSummary}` : ''
    lines.push(`    ${status}  ${contentType}${summary}`)
  }
  lines.push('')
}

function collectRefs(op: ParsedOperation): string[] {
  const refs = new Set<string>()
  const visit = (field: ParsedBodyField): void => {
    if (field.ref) refs.add(field.ref)
    for (const child of field.fields) visit(child)
  }
  if (op.requestBody) {
    for (const field of op.requestBody.fields) visit(field)
    for (const r of op.requestBody.refs) refs.add(r)
  }
  for (const r of op.responses) {
    if (r.ref) refs.add(r.ref)
  }
  for (const p of [...op.pathParams, ...op.queryParams, ...op.headerParams]) {
    if (p.ref) refs.add(p.ref)
  }
  return [...refs].toSorted((a, b) => a.localeCompare(b))
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  return JSON.stringify(value)
}
