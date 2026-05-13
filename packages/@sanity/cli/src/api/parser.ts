import {subdebug} from '@sanity/cli-core'
import {validate} from '@scalar/openapi-parser'
import {type OpenAPIV3, type OpenAPIV3_1} from '@scalar/openapi-types'
import {parse as parseYaml} from 'yaml'

import {fetchSpec, fetchSpecIndex, type OpenApiSpecIndexEntry} from './docsClient.js'

const debug = subdebug('api:parser')

/* ---------------------------------------------------------------------- *
 *  Capability classification                                              *
 * ---------------------------------------------------------------------- */

/**
 * Method-based capability classification used to tag operations in
 * `list` output: `[write]` / `[destructive]` / unmarked (read).
 *
 * `GET`/`HEAD`/`OPTIONS` → `read` (untagged).
 * `PATCH`/`PUT`/`DELETE` → `destructive`.
 * `POST` (and any other method, including `TRACE`/`CONNECT`) → `write`.
 *
 * Method-only by design — no path-name inspection. Keeps the rule
 * auditable and avoids false positives from path naming.
 */
type Capability = 'destructive' | 'read' | 'write'

export function classifyCapability(method: string): Capability {
  const upper = method.toUpperCase()
  if (upper === 'GET' || upper === 'HEAD' || upper === 'OPTIONS') return 'read'
  if (upper === 'PATCH' || upper === 'PUT' || upper === 'DELETE') return 'destructive'
  return 'write'
}

/* ---------------------------------------------------------------------- *
 *  Parsed spec types                                                      *
 * ---------------------------------------------------------------------- */

/** A request parameter (path / query / header) with full schema metadata. */
export interface ParsedParam {
  description: string
  in: 'header' | 'path' | 'query'
  name: string
  required: boolean
  type: string

  default?: unknown
  enum?: (number | string)[]
  example?: unknown
  /** When the param's schema is a `$ref`, the referenced schema name. */
  ref?: string
}

/**
 * One field of a request body schema. Refs are **linked**, not
 * expanded: when a field's schema is `$ref: '#/components/schemas/Foo'`,
 * `ref` carries `'Foo'` and `fields` stays empty. Agents resolve refs
 * via `sanity api spec <slug> --schema <name>`.
 */
export interface ParsedBodyField {
  description: string
  fields: ParsedBodyField[]
  name: string
  required: boolean
  type: string

  default?: unknown
  enum?: (number | string)[]
  ref?: string
}

export interface ParsedRequestBody {
  contentType: string
  /** Top-level object fields (empty for refs / non-JSON / opaque). */
  fields: ParsedBodyField[]
  /** Referenced schemas appearing at the body root. */
  refs: string[]
  required: boolean
  /** One-line summary — schema name for refs, `{a, b, c}` for inline, `<contentType>` for opaque. */
  schemaSummary: string
}

export interface ParsedResponse {
  contentType: string
  schemaSummary: string
  /** HTTP status code as a number, or `0` for `default`. */
  status: number

  /** When the response schema is a `$ref`, the referenced schema name. */
  ref?: string
}

interface SecurityScheme {
  /** Normalized scheme name, e.g. `BearerAuth`. */
  scheme: string
}

/** One parsed operation, denormalized for the CLI's operations index. */
export interface ParsedOperation {
  capability: Capability
  description: string
  /** `<api-version>/<path>` with `:name` placeholders (URL Pattern API style). */
  endpoint: string
  headerParams: ParsedParam[]
  isStreaming: boolean
  /** Uppercase HTTP method: `GET`, `POST`, … */
  method: string
  operationId: string
  optionalQueryParams: string[]
  /** Native OpenAPI path with `{name}` placeholders. */
  path: string
  pathParams: ParsedParam[]
  queryParams: ParsedParam[]
  requestBody: ParsedRequestBody | null
  responses: ParsedResponse[]
  security: SecurityScheme[]
  summary: string
}

/** Header info + operations for one OpenAPI spec. */
export interface ParsedSpec {
  description: string
  operations: ParsedOperation[]
  slug: string
  title: string
  /** `info.version` (may be a meaningless semver — the endpoint version comes from the server URL). */
  version: string
}

/** Flat operations index — one row per (spec, operation). */
export type OperationIndexEntry = ParsedOperation & {spec: string}

/* ---------------------------------------------------------------------- *
 *  URL Pattern helpers                                                    *
 * ---------------------------------------------------------------------- */

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const

type HttpMethod = (typeof HTTP_METHODS)[number]

/**
 * Server variables we treat as runtime context: a future
 * request-execution layer fills them at call time, so we keep them
 * as `:name` placeholders in the endpoint string rather than
 * substituting build-time defaults.
 */
const CONTEXT_SERVER_VARS = new Set(['dataset', 'organizationId', 'projectId'])

/** Convert `{name}` placeholders in a URL/path to `:name` (URL Pattern API). */
export function toUrlPatternForm(value: string): string {
  return value.replaceAll(/\{([^}]+)\}/g, ':$1')
}

/**
 * Build a deterministic operationId for operations that don't declare
 * one in the spec. Lowercases the method, strips placeholder braces,
 * collapses non-alphanumeric runs to a single `_`. Examples:
 *
 *   `POST /data/mutate/<dataset>` → `post_data_mutate_dataset`
 *   `GET  /v1/users`              → `get_v1_users`
 */
function synthesizeOperationId(method: string, path: string): string {
  const normalized = path
    .replaceAll(/[{}]/g, '')
    .replaceAll(/[^a-zA-Z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
  return `${method.toLowerCase()}_${normalized}`
}

/* ---------------------------------------------------------------------- *
 *  Server URL helpers                                                     *
 * ---------------------------------------------------------------------- */

/**
 * Substitute server-variable defaults into a server URL template.
 *
 * `preserveContext: true` leaves `{projectId}` / `{dataset}` /
 * `{organizationId}` alone so they survive into the URL-Pattern form
 * as `:name` placeholders — displayed verbatim in `list` output.
 */
function substituteServerVars(
  rawUrl: string,
  vars: Record<string, OpenAPIV3.ServerVariableObject> | undefined,
  options: {preserveContext: boolean},
): string {
  if (!vars) return rawUrl
  let url = rawUrl
  for (const [name, variable] of Object.entries(vars)) {
    if (options.preserveContext && CONTEXT_SERVER_VARS.has(name)) continue
    if (variable?.default !== undefined) {
      url = url.replaceAll(`{${name}}`, String(variable.default))
    }
  }
  return url
}

/**
 * Extract the pathname segment from a server URL template that may still
 * contain `{projectId}`-style placeholders.
 *
 * We can't use `new URL()` because `{` is not a legal host character —
 * `https://{projectId}.api.sanity.io/…` throws. Instead, strip the
 * `scheme://host` prefix manually via regex.
 */
function extractServerPathSegment(serverUrlWithPlaceholders: string): string {
  if (!serverUrlWithPlaceholders) return ''
  const match = serverUrlWithPlaceholders.match(/^[a-z]+:\/\/[^/]+(\/.*)?$/i)
  if (!match) return ''
  const pathname = match[1] || ''
  return pathname.replaceAll(/^\/+|\/+$/g, '')
}

/* ---------------------------------------------------------------------- *
 *  $ref helpers                                                           *
 * ---------------------------------------------------------------------- */

const SCHEMA_REF_PREFIX = '#/components/schemas/'
const PARAMETER_REF_PREFIX = '#/components/parameters/'

/**
 * Extract the schema name from `#/components/schemas/Foo`. Returns ''
 * for non-local or malformed refs — we don't follow remote refs.
 */
function schemaRefName(ref: string): string {
  return ref.startsWith(SCHEMA_REF_PREFIX) ? ref.slice(SCHEMA_REF_PREFIX.length) : ''
}

/**
 * Resolve a `#/components/parameters/<name>` ref against the spec root.
 * Unlike schema refs (link-not-resolve), parameter refs MUST resolve —
 * path params especially: without them, the URL template loses
 * placeholders. 8 of 22 Sanity specs use this pattern.
 */
function resolveParameterRef(
  ref: string,
  root: OpenAPIV3_1.Document,
): OpenAPIV3.ParameterObject | OpenAPIV3_1.ParameterObject | null {
  if (!ref.startsWith(PARAMETER_REF_PREFIX)) return null
  const name = ref.slice(PARAMETER_REF_PREFIX.length)
  const params = root.components?.parameters
  const target = params?.[name]
  if (!target || '$ref' in target) return null
  return target as OpenAPIV3.ParameterObject | OpenAPIV3_1.ParameterObject
}

/* ---------------------------------------------------------------------- *
 *  Schema type / summary helpers                                          *
 * ---------------------------------------------------------------------- */

type SchemaLike = Record<string, unknown>

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
 *  Parameter extraction                                                   *
 * ---------------------------------------------------------------------- */

type ParameterObject = OpenAPIV3.ParameterObject | OpenAPIV3_1.ParameterObject
type RefOrParameter = OpenAPIV3.ReferenceObject | ParameterObject

/**
 * Resolve a (possibly $ref'd) parameter object and extract a
 * `ParsedParam` with full schema metadata. Returns null for malformed
 * or unresolvable params so callers can filter without crashing.
 */
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

  const ref = asString(schema.$ref)
  if (ref) {
    const refName = schemaRefName(ref)
    if (refName) parsed.ref = refName
  }
  if (enumValues.length > 0) parsed.enum = enumValues
  const defaultValue = schema.default ?? (param as Record<string, unknown>).default
  if (defaultValue !== undefined) parsed.default = defaultValue
  const exampleValue = schema.example ?? (param as Record<string, unknown>).example
  if (exampleValue !== undefined) parsed.example = exampleValue
  return parsed
}

/* ---------------------------------------------------------------------- *
 *  Request body extraction                                                *
 * ---------------------------------------------------------------------- */

/**
 * Walk one property schema into a `ParsedBodyField`. Refs stop here:
 * the ref name lands on `ref`, recursion does not follow. Inline objects
 * (and arrays-of-objects) recurse one level deeper.
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

  // Don't follow refs — link-not-resolve.
  if (ref) return field

  // Recurse into inline objects / arrays-of-objects.
  const t = asString(schema.type)
  if (t === 'object' || schema.properties) {
    field.fields = walkProperties(schema)
  } else if (t === 'array') {
    const items = asObject(schema.items)
    // `items: {$ref: ...}` is the common shape for arrays of refs.
    // Surface the element schema name so the footer can drill into it.
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
function flattenComposition(schema: SchemaLike): {
  fields: ParsedBodyField[]
  refs: string[]
} {
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
      // Inline variants: use the first one's properties for a representative shape.
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

type RefOrRequestBody = OpenAPIV3.ReferenceObject | OpenAPIV3.RequestBodyObject

function parseRequestBody(opRaw: OperationObject): ParsedRequestBody | null {
  const body = opRaw.requestBody as RefOrRequestBody | undefined
  if (!body) return null
  // Body-level $refs are rare; specs we own don't use them. Treat as no body.
  if ('$ref' in body) return null

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
 *  Response extraction                                                    *
 * ---------------------------------------------------------------------- */

function parseResponses(opRaw: OperationObject): ParsedResponse[] {
  const responses = asObject(opRaw.responses)
  const out: ParsedResponse[] = []
  for (const [statusKey, rawResponse] of Object.entries(responses)) {
    const status = statusKey === 'default' ? 0 : Number.parseInt(statusKey, 10)
    if (!Number.isFinite(status) && statusKey !== 'default') continue
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
  return out.toSorted((a, b) => a.status - b.status)
}

function isStreamingResponse(responses: ParsedResponse[]): boolean {
  return responses.some((r) => r.status === 200 && r.contentType === 'text/event-stream')
}

/* ---------------------------------------------------------------------- *
 *  Security extraction                                                    *
 * ---------------------------------------------------------------------- */

/**
 * Specs inconsistently spell `BearerAuth` / `bearerAuth`. Same scheme;
 * capitalize the first letter for uniform display.
 */
function normalizeSchemeName(name: string): string {
  if (!name) return ''
  return name[0].toUpperCase() + name.slice(1)
}

function parseSecurity(opRaw: OperationObject, root: OpenAPIV3_1.Document): SecurityScheme[] {
  const opSecurity = asArray<SchemaLike>(opRaw.security)
  const source = opSecurity.length > 0 ? opSecurity : asArray<SchemaLike>(root.security)
  const schemes = new Set<string>()
  for (const requirement of source) {
    for (const key of Object.keys(requirement)) schemes.add(normalizeSchemeName(key))
  }
  return [...schemes].map((scheme) => ({scheme}))
}

/* ---------------------------------------------------------------------- *
 *  Component schema lookup (for `--schema <name>`)                        *
 * ---------------------------------------------------------------------- */

/**
 * Return the raw `components.schemas.<name>` object from a spec YAML,
 * or `null` if the schema doesn't exist. Used by the `--schema` flag
 * on `api spec` to let agents follow `$ref` pointers surfaced in
 * operation output.
 *
 * Reads YAML directly rather than going through validate() — this is a
 * synchronous lookup over the raw document, no extraction logic needed.
 */
export function lookupComponentSchema(yaml: string, name: string): unknown {
  const doc = parseYaml(yaml)
  if (!doc || typeof doc !== 'object') return null
  const components = asObject((doc as SchemaLike).components)
  const schemas = asObject(components.schemas)
  return name in schemas ? schemas[name] : null
}

/** List all `components.schemas` keys defined by a spec. */
export function listComponentSchemas(yaml: string): string[] {
  const doc = parseYaml(yaml)
  if (!doc || typeof doc !== 'object') return []
  const components = asObject((doc as SchemaLike).components)
  const schemas = asObject(components.schemas)
  return Object.keys(schemas)
}

/* ---------------------------------------------------------------------- *
 *  OpenAPI parser                                                         *
 * ---------------------------------------------------------------------- */

type OperationObject = OpenAPIV3.OperationObject | OpenAPIV3_1.OperationObject
type PathItemObject = OpenAPIV3.PathItemObject | OpenAPIV3_1.PathItemObject

/**
 * Parse an OpenAPI spec (YAML or JSON string) into a `ParsedSpec`
 * (header info + flat operations list). Validation goes through
 * `@scalar/openapi-parser`, which leaves `$ref`s in place
 * (link-not-resolve for schemas; parameter refs are resolved inline).
 *
 * Strict validation warnings (missing descriptions, unbound path params,
 * etc.) are not fatal — surfaces whatever it can read. Only hard parse
 * failures (`specification` missing entirely) throw.
 *
 * Operations without an `operationId` are skipped and debug-logged.
 */
export async function parseOpenApi(slug: string, yaml: string): Promise<ParsedSpec> {
  const result = await validate(yaml)
  if (!result.specification) {
    const messages = result.errors?.map((e) => e.message).join('; ') ?? 'unknown error'
    throw new Error(`Spec "${slug}" failed to parse: ${messages}`)
  }
  if (result.version && result.version !== '3.0' && result.version !== '3.1') {
    debug(`spec "${slug}" uses OpenAPI ${result.version} — proceeding with best-effort parse`)
  }
  const doc = result.specification as OpenAPIV3_1.Document

  const serverObj = doc.servers?.[0]
  const serverUrlRaw = serverObj?.url || ''
  const serverVars = serverObj?.variables as
    | Record<string, OpenAPIV3.ServerVariableObject>
    | undefined

  // The version path-segment lives in the resolved server URL's pathname
  // — NOT `info.version` (which can be a meaningless semver like `1.0.0`
  // for specs whose API version is declared in server variables, or
  // baked literally into the OpenAPI `paths` keys). Context vars
  // (`{projectId}`, `{dataset}`, `{organizationId}`) are preserved so
  // they survive as `:name` placeholders in the final URL-Pattern form.
  const serverUrlWithContextVars = substituteServerVars(serverUrlRaw, serverVars, {
    preserveContext: true,
  })
  const serverPathSegment = extractServerPathSegment(serverUrlWithContextVars)

  const operations: ParsedOperation[] = []
  for (const [rawPath, pathItem] of Object.entries(doc.paths ?? {})) {
    if (!pathItem) continue
    const pathItemObj = pathItem as PathItemObject
    const commonParams = pathItemObj.parameters

    for (const method of HTTP_METHODS) {
      const op = pathItemObj[method as HttpMethod] as OperationObject | undefined
      if (!op) continue

      const methodUpper = method.toUpperCase()
      // Some specs we don't control omit `operationId` (e.g. the `mutation`
      // spec's POST). Synthesize a deterministic id from method + path so
      // every row stays uniquely addressable for agents indexing by
      // operationId. Real ids win when present.
      const operationId = op.operationId ?? synthesizeOperationId(method, rawPath)
      if (!op.operationId) {
        debug(`synthesized operationId "${operationId}" for ${methodUpper} ${rawPath}`)
      }

      const allParams = ([...(commonParams ?? []), ...(op.parameters ?? [])] as RefOrParameter[])
        .map((raw) => parseParam(raw, doc))
        .filter((p): p is ParsedParam => p !== null)

      const responses = parseResponses(op)
      const opPath = rawPath.replace(/^\/+/, '')
      const combined = serverPathSegment ? `${serverPathSegment}/${opPath}` : opPath

      operations.push({
        capability: classifyCapability(methodUpper),
        description: op.description ?? '',
        endpoint: toUrlPatternForm(combined),
        headerParams: allParams.filter((p) => p.in === 'header'),
        isStreaming: isStreamingResponse(responses),
        method: methodUpper,
        operationId,
        optionalQueryParams,
        path: rawPath,
        pathParams: allParams.filter((p) => p.in === 'path'),
        queryParams: allParams.filter((p) => p.in === 'query'),
        requestBody: parseRequestBody(op),
        responses,
        security: parseSecurity(op, doc),
        summary: op.summary ?? '',
      })
    }
  }

  return {
    description: doc.info?.description ?? '',
    operations,
    slug,
    title: doc.info?.title || slug,
    version: doc.info?.version ?? '',
  }
}

/* ---------------------------------------------------------------------- *
 *  Loaders                                                                *
 * ---------------------------------------------------------------------- */

/**
 * Fetch the docs index and every per-spec body, parse each, and return
 * the flat operations index — sorted by spec → path → method.
 *
 * Single seam for the discovery pipeline. Callers don't need to wire
 * the index fetch + fan-out + flatten + sort steps themselves.
 *
 * `onlySlug` short-circuits the fan-out: when set, the index is
 * filtered before any per-spec fetches happen, so
 * `sanity api list --spec=jobs` makes one index request + one spec
 * request instead of one + 22.
 *
 * Error semantics:
 *   - The index fetch throws on network/non-2xx — callers translate
 *     that into a user-facing message.
 *   - Per-spec 404s are skipped silently.
 *   - Per-spec parse errors are debug-logged and skipped without
 *     breaking the run.
 *
 * Specs are fetched in parallel — independent requests, no reason to
 * serialize.
 */
async function loadOperationsIndex(
  options: {onlySlug?: string} = {},
): Promise<OperationIndexEntry[]> {
  const index = await fetchSpecIndex()
  const targets = options.onlySlug
    ? index.filter((entry) => entry.slug === options.onlySlug)
    : index
  const buckets = await Promise.all(targets.map((entry) => fetchAndParseEntry(entry)))
  return sortOperations(buckets.flat())
}

async function fetchAndParseEntry(entry: OpenApiSpecIndexEntry): Promise<OperationIndexEntry[]> {
  // Wrap both fetch and parse — one spec's 5xx / timeout / parse error
  // mustn't poison the whole `list` invocation. Per-spec failures are
  // debug-logged; the remaining 21 specs still surface to the user.
  try {
    const yaml = await fetchSpec(entry.slug)
    if (yaml === null) return []
    const parsed = await parseOpenApi(entry.slug, yaml)
    return parsed.operations.map((op) => ({...op, spec: entry.slug}))
  } catch (error) {
    debug(`skipping spec "${entry.slug}" — fetch/parse error`, error)
    return []
  }
}

/**
 * The user-facing message every command surfaces when the docs
 * service is unreachable. Lives next to the loader so the wrappers
 * in command files don't each redefine their own copy.
 */
export const DOCS_SERVICE_UNAVAILABLE =
  'The OpenAPI service is currently unavailable. Try again later.'

/**
 * Convenience wrapper around `loadOperationsIndex` that re-throws
 * network / parse errors as a single user-friendly Error. Saves
 * every consumer command from re-implementing the same try/catch
 * + `this.error(…)` shape.
 */
export async function loadOperationsIndexOrThrow(
  options: {onlySlug?: string} = {},
): Promise<OperationIndexEntry[]> {
  try {
    return await loadOperationsIndex(options)
  } catch (error) {
    debug('loadOperationsIndex failed', error)
    throw new Error(DOCS_SERVICE_UNAVAILABLE, {cause: error})
  }
}

/** Sort by spec asc → path asc → method asc — stable for diffability. */
function sortOperations(entries: OperationIndexEntry[]): OperationIndexEntry[] {
  return entries.toSorted((a, b) => {
    if (a.spec !== b.spec) return a.spec < b.spec ? -1 : 1
    if (a.path !== b.path) return a.path < b.path ? -1 : 1
    return a.method < b.method ? -1 : a.method > b.method ? 1 : 0
  })
}

/**
 * Result of a single-spec fetch. The raw YAML is kept alongside the
 * parsed form so the spec command can pass it straight through for
 * `--format=openapi` and use it for `--schema <name>` lookups.
 */
interface LoadedSpec {
  index: OpenApiSpecIndexEntry
  parsed: ParsedSpec
  /** Raw YAML as returned by the docs endpoint. */
  yaml: string
}

/**
 * Fetch + parse a single spec by slug. Returns null when the slug
 * isn't in the docs index, or the spec body 404s. Throws on network
 * or parse errors so callers can translate into a user-facing message.
 */
export async function loadSingleSpec(slug: string): Promise<LoadedSpec | null> {
  const index = await fetchSpecIndex()
  const entry = index.find((e) => e.slug === slug)
  if (!entry) return null

  const yaml = await fetchSpec(slug)
  if (yaml === null) return null

  const parsed = await parseOpenApi(slug, yaml)
  return {index: entry, parsed, yaml}
}
