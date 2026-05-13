/**
 * Shape-coercion + small OpenAPI-shape helpers used by both
 * `parser.ts` (orchestration) and `extractors.ts` (per-aspect
 * extraction). Lives in its own module to keep the dependency
 * direction clean: `parser` → `extractors` → `internal`.
 *
 * Nothing here is part of the public CLI surface — these are
 * implementation details of the parsing layer.
 */

export type SchemaLike = Record<string, unknown>

const SCHEMA_REF_PREFIX = '#/components/schemas/'

export function asObject(value: unknown): SchemaLike {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as SchemaLike) : {}
}

export function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/**
 * Extract the schema name from `#/components/schemas/Foo`. Returns ''
 * for non-local or malformed refs — we don't follow remote refs.
 */
export function schemaRefName(ref: string): string {
  return ref.startsWith(SCHEMA_REF_PREFIX) ? ref.slice(SCHEMA_REF_PREFIX.length) : ''
}

/**
 * One-word type label for table / help display. Refs collapse to the
 * schema name (`'Foo'`) so the output is immediately useful without
 * resolution. Composition (`allOf`/`oneOf`/`anyOf`) collapses to
 * `'object'`; the body walker handles composition itself.
 */
export function describeType(schema: SchemaLike): string {
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
export function summarizeInlineObject(properties: SchemaLike): string {
  const names = Object.keys(properties)
  if (names.length === 0) return ''
  const head = names.slice(0, 6).join(', ')
  return names.length > 6 ? `{ ${head}, … }` : `{ ${head} }`
}
