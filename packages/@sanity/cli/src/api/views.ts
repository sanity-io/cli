/**
 * Output renderers for `api list` and `api spec`.
 *
 * - `list` view: 4-column operations table (human) + per-row JSON projection (machine).
 * - `spec` view: per-spec human render (header + per-operation blocks) + structured JSON envelope.
 *
 * Two distinct JSON shapes by design. The list row stands alone (it
 * needs `spec` + `docsUrl` per entry). The spec-view operation nests
 * under a single spec envelope, so those fields would be redundant.
 *
 * `$ref` policy in JSON output: we **link, never resolve**. Body
 * fields and response schemas carry `ref: '<schemaName>'` when they
 * point at `components.schemas.<schemaName>`. Agents follow up with
 * `sanity api spec <slug> --schema <name>`.
 */

import {Table} from 'console-table-printer'

import {docsUrlFor, type OpenApiSpecIndexEntry} from './docsClient.js'
import {
  type OperationIndexEntry,
  type ParsedBodyField,
  type ParsedOperation,
  type ParsedParam,
  type ParsedRequestBody,
  type ParsedResponse,
  type ParsedSpec,
} from './parser.js'

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
    docsUrl: docsUrlFor(op.spec),
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
    docsUrl: `${HTTP_REFERENCE_URL}/${encodeURIComponent(slug)}`,
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
 * Render a spec as a human-readable structured view: header + one
 * block per operation (method, endpoint, operationId, capability tags,
 * summary, params with typed columns, request body, responses, auth,
 * `Schemas referenced` footer pointing at `--schema <name>`).
 */
export function renderSpecHumanView(
  slug: string,
  entry: OpenApiSpecIndexEntry | undefined,
  parsed: ParsedSpec,
  operations: ParsedOperation[],
): string {
  const title = entry?.title || parsed.title || slug
  const description = entry?.description || parsed.description
  const docsUrl = `${HTTP_REFERENCE_URL}/${encodeURIComponent(slug)}`

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
  const summaryLine = op.summary || op.description
  const requiredQueryParams = op.queryParams.filter((p) => p.required)
  const optionalQueryParams = op.queryParams.filter((p) => !p.required)
  const allRefs = collectRefs(op)

  const lines: string[] = [
    HUMAN_SEPARATOR,
    `${op.method}  ${op.endpoint}  ·  ${op.operationId}  ·  ${tags}`,
    ...(summaryLine ? [summaryLine] : []),
    '',
  ]

  appendParamSection(lines, 'Path params', op.pathParams)
  // Gate optional sections behind length checks so we don't render a
  // dead `Query params (required): (none)` block on endpoints that
  // only have optional query params. Path params stay unconditional —
  // most operations have at least one, and absence is itself signal.
  if (requiredQueryParams.length > 0) {
    appendParamSection(lines, 'Query params (required)', requiredQueryParams)
  }
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
    const req = p.required ? 'required' : 'optional'
    lines.push(`    ${p.name}  ${p.type}  ${req}`)
    if (p.description) lines.push(`      ${p.description}`)
    if (p.enum) lines.push(`      enum: ${p.enum.join(' | ')}`)
    if (p.default !== undefined) lines.push(`      default: ${formatValue(p.default)}`)
    if (p.example !== undefined) lines.push(`      example: ${formatValue(p.example)}`)
  }
  lines.push('')
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
  return JSON.stringify(value)
}
