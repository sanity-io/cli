/**
 * Per-aspect extractors that translate raw OpenAPI operation objects
 * into the CLI's `Parsed*` shapes. Each export reads one slice of an
 * operation:
 *
 *   - `extractParameters`   → typed params (path/query/header), with
 *                              `$ref: '#/components/parameters/<name>'`
 *                              resolved against the spec root.
 *   - `extractRequestBody`  → structured body fields with composition
 *                              flattening (`allOf` merge, `oneOf`/`anyOf`
 *                              first-variant + refs). `$ref` schemas are
 *                              linked, not expanded.
 *   - `extractResponses`    → `{status, contentType, schemaSummary, ref?}`
 *                              sorted by status.
 *   - `extractSecurity`     → normalized scheme names, falling back to
 *                              the spec-root `security:` when an op
 *                              doesn't override.
 *
 * The parser orchestration calls these per operation; nothing here
 * knows about HTTP, loading, or the list/spec views.
 */

import {subdebug} from '@sanity/cli-core'
import {type OpenAPIV3, type OpenAPIV3_1} from '@scalar/openapi-types'

import {
  type ParsedBodyField,
  type ParsedParam,
  type ParsedRequestBody,
  type ParsedResponse,
  type SecurityScheme,
} from './parser.js'

type OperationObject = OpenAPIV3.OperationObject | OpenAPIV3_1.OperationObject
type ParameterObject = OpenAPIV3.ParameterObject | OpenAPIV3_1.ParameterObject
type RefOrParameter = OpenAPIV3.ReferenceObject | ParameterObject

type SchemaLike = Record<string, unknown>

const debug = subdebug('api:extractors')

const PARAMETER_REF_PREFIX = '#/components/parameters/'
const SCHEMA_REF_PREFIX = '#/components/schemas/'

/* ---------------------------------------------------------------------- *
 *  Shape coercion + OpenAPI-shape helpers                                 *
 *                                                                         *
 *  Local because they're only meaningful inside the extractor pipeline.   *
 *  Lifting them out earned a separate module + import surface without     *
 *  earning real depth — the bug risk lives in how `walkProperty` /        *
 *  `flattenComposition` compose them, not in the guards themselves.       *
 * ---------------------------------------------------------------------- */

function asObject(value: unknown): SchemaLike {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as SchemaLike) : {}
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/**
 * Extract the schema name from `#/components/schemas/Foo`. Returns ''
 * for non-local or malformed refs — we don't follow remote refs.
 */
function schemaRefName(ref: string): string {
  return ref.startsWith(SCHEMA_REF_PREFIX) ? ref.slice(SCHEMA_REF_PREFIX.length) : ''
}

/**
 * One-word type label for table / help display. Refs collapse to the
 * schema name (`'Foo'`) so the output is immediately useful without
 * resolution. Composition (`allOf`/`oneOf`/`anyOf`) collapses to
 * `'object'`; the body walker handles composition itself.
 */
function describeType(schema: SchemaLike): string {
  const ref = asString(schema.$ref)
  if (ref) return schemaRefName(ref) || 'unknown'
  const t = asString(schema.type)
  if (t) {
    if (t === 'array') {
      const inner = describeType(asObject(schema.items))
      return inner === 'unknown' ? 'array' : `${inner}[]`
    }
    return t
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return typeof schema.enum[0] === 'number' ? 'number' : 'string'
  }
  if (Array.isArray(schema.allOf) || Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) {
    return 'object'
  }
  return 'unknown'
}

/** Compact `{ a, b, c }` summary of an inline object schema. */
function summarizeInlineObject(properties: SchemaLike): string {
  const names = Object.keys(properties)
  if (names.length === 0) return ''
  const head = names.slice(0, 6).join(', ')
  return names.length > 6 ? `{ ${head}, … }` : `{ ${head} }`
}

/* ---------------------------------------------------------------------- *
 *  Parameters                                                             *
 * ---------------------------------------------------------------------- */

/**
 * Resolve a `#/components/parameters/<name>` ref against the spec root.
 * Unlike schema refs (link-not-resolve), parameter refs MUST resolve —
 * path params especially: without them, the URL template loses
 * placeholders. 8 of 22 Sanity specs use this pattern.
 */
function resolveParameterRef(ref: string, root: OpenAPIV3_1.Document): ParameterObject | null {
  if (!ref.startsWith(PARAMETER_REF_PREFIX)) return null
  const name = ref.slice(PARAMETER_REF_PREFIX.length)
  const params = root.components?.parameters
  const target = params?.[name]
  if (!target || '$ref' in target) return null
  return target as ParameterObject
}

function parseParam(rawParam: RefOrParameter, root: OpenAPIV3_1.Document): ParsedParam | null {
  const param: ParameterObject | null =
    '$ref' in rawParam ? resolveParameterRef(rawParam.$ref, root) : rawParam
  if (!param) return null

  const location = param.in
  if (!param.name || (location !== 'path' && location !== 'query' && location !== 'header')) {
    return null
  }

  const schema = asObject(param.schema)
  // OpenAPI lets `enum`/`default`/`example` live on either the param or its schema; check both.
  const enumValues =
    asArray<number | string>(schema.enum).length > 0
      ? asArray<number | string>(schema.enum)
      : asArray<number | string>((param as Record<string, unknown>).enum)

  const parsed: ParsedParam = {
    description: param.description || asString(schema.description),
    in: location,
    name: param.name,
    required: location === 'path' ? true : param.required === true,
    type: describeType(schema),
  }

  // Surface a schema name on `ref` for both direct refs and `array<$ref>`
  // shapes, so the schemas-referenced footer can find them.
  const directRef = asString(schema.$ref)
  if (directRef) {
    const refName = schemaRefName(directRef)
    if (refName) parsed.ref = refName
  } else if (asString(schema.type) === 'array') {
    const itemsRef = asString(asObject(schema.items).$ref)
    if (itemsRef) {
      const refName = schemaRefName(itemsRef)
      if (refName) parsed.ref = refName
    }
  }
  if (enumValues.length > 0) parsed.enum = enumValues
  const defaultValue = schema.default ?? (param as Record<string, unknown>).default
  if (defaultValue !== undefined) parsed.default = defaultValue
  const exampleValue = schema.example ?? (param as Record<string, unknown>).example
  if (exampleValue !== undefined) parsed.example = exampleValue
  return parsed
}

/**
 * Merge path-item-level and operation-level params, deduping by
 * `(name, in)` with operation-level wins (per OpenAPI 3.x), and split
 * into path / query / header groups.
 */
export function extractParameters(
  pathItemParams: RefOrParameter[] | undefined,
  opParams: RefOrParameter[] | undefined,
  root: OpenAPIV3_1.Document,
): {headerParams: ParsedParam[]; pathParams: ParsedParam[]; queryParams: ParsedParam[]} {
  const merged = new Map<string, ParsedParam>()
  for (const raw of [...(pathItemParams ?? []), ...(opParams ?? [])]) {
    const parsed = parseParam(raw, root)
    if (parsed) merged.set(`${parsed.in}:${parsed.name}`, parsed)
  }
  const all = [...merged.values()]
  return {
    headerParams: all.filter((p) => p.in === 'header'),
    pathParams: all.filter((p) => p.in === 'path'),
    queryParams: all.filter((p) => p.in === 'query'),
  }
}

/* ---------------------------------------------------------------------- *
 *  Request body                                                           *
 * ---------------------------------------------------------------------- */

/**
 * Walk one property schema into a `ParsedBodyField`. Refs stop here:
 * the ref name lands on `ref`, recursion does not follow. Inline objects
 * (and arrays-of-objects) recurse one level deeper. `array<$ref>` shapes
 * surface the element schema name on `ref` for footer drill-in.
 */
function walkProperty(name: string, rawSchema: unknown, isRequired: boolean): ParsedBodyField {
  const schema = asObject(rawSchema)
  const ref = asString(schema.$ref)
  const refName = ref ? schemaRefName(ref) : ''

  const field: ParsedBodyField = {
    description: asString(schema.description),
    fields: [],
    name,
    required: isRequired,
    type: describeType(schema),
  }
  if (refName) field.ref = refName
  const enumValues = asArray<number | string>(schema.enum)
  if (enumValues.length > 0) field.enum = enumValues
  if (schema.default !== undefined) field.default = schema.default

  if (ref) return field

  const t = asString(schema.type)
  if (t === 'object' || schema.properties) {
    field.fields = walkProperties(schema)
  } else if (t === 'array') {
    const items = asObject(schema.items)
    const itemsRef = asString(items.$ref)
    if (itemsRef) {
      const itemsRefName = schemaRefName(itemsRef)
      if (itemsRefName) field.ref = itemsRefName
    } else if (asString(items.type) === 'object' || items.properties) {
      field.fields = walkProperties(items)
    }
  }
  return field
}

function walkProperties(schema: SchemaLike): ParsedBodyField[] {
  const properties = asObject(schema.properties)
  const required = new Set(asArray<string>(schema.required))
  return Object.entries(properties).map(([propName, propSchema]) =>
    walkProperty(propName, propSchema, required.has(propName)),
  )
}

/**
 * Flatten `allOf` at a schema root by collecting inline properties from
 * every variant. `oneOf`/`anyOf` take the first variant for properties.
 * Refs at any variant slot land in `refs` for caller to surface as
 * follow-up pointers.
 */
function flattenComposition(schema: SchemaLike): {fields: ParsedBodyField[]; refs: string[]} {
  const refs = new Set<string>()
  const fieldsByName = new Map<string, ParsedBodyField>()
  for (const f of walkProperties(schema)) fieldsByName.set(f.name, f)

  const ownRef = asString(schema.$ref)
  if (ownRef) {
    const name = schemaRefName(ownRef)
    if (name) refs.add(name)
  }

  for (const variant of asArray<SchemaLike>(schema.allOf)) {
    const sub = flattenComposition(variant)
    for (const f of sub.fields) {
      if (!fieldsByName.has(f.name)) fieldsByName.set(f.name, f)
    }
    for (const r of sub.refs) refs.add(r)
  }

  for (const key of ['oneOf', 'anyOf'] as const) {
    const variants = asArray<SchemaLike>(schema[key])
    for (const [i, variant] of variants.entries()) {
      const variantRef = asString(variant.$ref)
      if (variantRef) {
        const name = schemaRefName(variantRef)
        if (name) refs.add(name)
        continue
      }
      if (i === 0) {
        const sub = flattenComposition(variant)
        for (const f of sub.fields) {
          if (!fieldsByName.has(f.name)) fieldsByName.set(f.name, f)
        }
        for (const r of sub.refs) refs.add(r)
      }
    }
  }

  return {fields: [...fieldsByName.values()], refs: [...refs]}
}

function pickContentType(content: SchemaLike): string {
  const keys = Object.keys(content)
  if (keys.length === 0) return ''
  if ('application/json' in content) return 'application/json'
  return keys[0]
}

function isJsonContentType(contentType: string): boolean {
  return contentType === 'application/json' || contentType.endsWith('+json')
}

function summarizeBodySchema(schema: SchemaLike, refs: string[]): string {
  const inline = summarizeInlineObject(asObject(schema.properties))
  if (inline) return inline
  if (refs.length > 0) return refs.length === 1 ? refs[0] : `oneOf(${refs.join(', ')})`
  return describeType(schema)
}

export function extractRequestBody(
  opRaw: OperationObject,
  context?: {operationId?: string; specSlug?: string},
): ParsedRequestBody | null {
  const body = opRaw.requestBody as
    | OpenAPIV3.ReferenceObject
    | OpenAPIV3.RequestBodyObject
    | undefined
  if (!body) return null
  // Body-level $refs are rare; specs we own don't use them. Treat as no body.
  // Debug-log so operators can spot specs that start using this shape — the
  // parser would otherwise silently render the operation as bodyless.
  if ('$ref' in body) {
    debug(
      `body-level $ref skipped (treated as no body) in ${context?.specSlug ?? '<unknown spec>'}:${context?.operationId ?? '<unknown op>'} → ${body.$ref}`,
    )
    return null
  }

  const content = asObject(body.content)
  if (Object.keys(content).length === 0) return null

  const contentType = pickContentType(content)
  const mediaTypeObj = asObject(content[contentType])
  const schema = asObject(mediaTypeObj.schema)

  if (!isJsonContentType(contentType)) {
    return {
      contentType,
      fields: [],
      refs: [],
      required: body.required === true,
      schemaSummary: `<${contentType}>`,
    }
  }

  const {fields, refs} = flattenComposition(schema)
  return {
    contentType,
    fields,
    refs,
    required: body.required === true,
    schemaSummary: summarizeBodySchema(schema, refs),
  }
}

/* ---------------------------------------------------------------------- *
 *  Responses                                                              *
 * ---------------------------------------------------------------------- */

export function extractResponses(opRaw: OperationObject): ParsedResponse[] {
  const responses = asObject(opRaw.responses)
  const out: ParsedResponse[] = []
  for (const [statusKey, rawResponse] of Object.entries(responses)) {
    // OpenAPI 3.x allows range keys (`2XX`, `4XX`, `5XX`) alongside
    // specific codes and `default`. `parseInt` would silently collapse
    // `2XX` → `2`, so require a fully-numeric key. Range keys are
    // skipped (and debug-logged at the call site) — Sanity's specs
    // don't use them today, and surfacing one as a single-digit
    // status would be more misleading than dropping the row.
    let status: number
    if (statusKey === 'default') {
      status = 0
    } else if (/^\d+$/.test(statusKey)) {
      status = Number.parseInt(statusKey, 10)
    } else {
      debug(`skipping non-numeric response status "${statusKey}"`)
      continue
    }
    const response = asObject(rawResponse)
    // Skip response refs — uncommon in our specs, and the schema lookup
    // covers the use case if anyone needs it.
    if (asString(response.$ref)) continue

    const content = asObject(response.content)
    const contentType = pickContentType(content)
    const mediaObj = asObject(content[contentType])
    const schema = asObject(mediaObj.schema)

    let schemaSummary = ''
    let ref: string | undefined
    if (contentType) {
      const schemaRef = asString(schema.$ref)
      if (schemaRef) {
        const name = schemaRefName(schemaRef)
        if (name) {
          ref = name
          schemaSummary = name
        }
      } else if (isJsonContentType(contentType)) {
        schemaSummary =
          summarizeInlineObject(asObject(schema.properties)) ||
          (Object.keys(schema).length > 0 ? describeType(schema) : '')
      } else {
        schemaSummary = `<${contentType}>`
      }
    }

    const entry: ParsedResponse = {contentType, schemaSummary, status}
    if (ref) entry.ref = ref
    out.push(entry)
  }
  // Sort numeric statuses ascending; `default` (status === 0) goes
  // last — conventional UI order puts the catch-all after specific
  // codes.
  return out.toSorted((a, b) => sortKey(a.status) - sortKey(b.status))
}

function sortKey(status: number): number {
  return status === 0 ? Number.POSITIVE_INFINITY : status
}

export function isStreamingResponse(responses: ParsedResponse[]): boolean {
  return responses.some(
    (r) => r.status >= 200 && r.status < 300 && r.contentType === 'text/event-stream',
  )
}

/* ---------------------------------------------------------------------- *
 *  Security                                                               *
 * ---------------------------------------------------------------------- */

/**
 * Specs inconsistently spell `BearerAuth` / `bearerAuth`. Same scheme;
 * capitalize the first letter for uniform display.
 */
function normalizeSchemeName(name: string): string {
  if (!name) return ''
  return name[0].toUpperCase() + name.slice(1)
}

export function extractSecurity(
  opRaw: OperationObject,
  root: OpenAPIV3_1.Document,
): SecurityScheme[] {
  const opSecurity = asArray<SchemaLike>(opRaw.security)
  const source = opSecurity.length > 0 ? opSecurity : asArray<SchemaLike>(root.security)
  const schemes = new Set<string>()
  for (const requirement of source) {
    for (const key of Object.keys(requirement)) schemes.add(normalizeSchemeName(key))
  }
  return [...schemes].map((scheme) => ({scheme}))
}
