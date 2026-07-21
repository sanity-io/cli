import {ApiUsageError} from './errors.js'

/**
 * A JSON-compatible value produced by field parsing.
 */
export type FieldValue =
  | boolean
  | FieldValue[]
  | number
  | string
  | {[key: string]: FieldValue}
  | null

/**
 * Options for {@link parseFields}.
 */
export interface ParseFieldsOptions {
  /**
   * Typed fields (`-F/--field`): `true`, `false`, `null` and numbers are
   * converted; `@<file>` reads the value from a file, `@-` from stdin.
   */
  fields?: string[]

  /** Raw string fields (`-f/--raw-field`): the value is used verbatim. */
  rawFields?: string[]

  /** Reads a file referenced via `@<file>`. */
  readFile?: (path: string) => string

  /** Content of stdin, for `@-` values. */
  stdin?: string
}

const KEY_RE = /^([^=[\]]+)((?:\[[^[\]]*\])*)$/

/**
 * Convert parsed fields to query parameters, for request methods without a
 * body (GET/HEAD). Only scalar values (and arrays of scalars) are supported.
 */
export function fieldsToQuery(
  fields: Record<string, FieldValue>,
): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {}

  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      if (value.some((item) => typeof item === 'object' && item !== null)) {
        throw new ApiUsageError(`Cannot use nested field "${key}" as a query parameter`)
      }
      query[key] = value.map(String)
    } else if (typeof value === 'object' && value !== null) {
      throw new ApiUsageError(`Cannot use nested field "${key}" as a query parameter`)
    } else {
      query[key] = String(value)
    }
  }

  return query
}

/**
 * Parse `gh api`-style field flags into a JSON-compatible object.
 *
 * Supports nested keys with bracket syntax: `a[b]=1` produces `{a: {b: 1}}`
 * and `a[]=1` appends to an array. Raw fields (`-f`) keep values as strings;
 * typed fields (`-F`) convert `true`/`false`/`null` and numbers, and expand
 * `@<file>` / `@-` to file or stdin contents.
 */
export function parseFields(options: ParseFieldsOptions): Record<string, FieldValue> {
  const {fields = [], rawFields = [], readFile, stdin} = options
  // Null-prototype containers keep user-supplied keys like `__proto__` or
  // `toString` ordinary own properties: nothing to pollute, nothing inherited.
  const result: Record<string, FieldValue> = Object.create(null)

  for (const raw of rawFields) {
    const {key, value} = splitField(raw, '--raw-field')
    setField(result, key, value)
  }

  for (const field of fields) {
    const {key, value} = splitField(field, '--field')
    setField(result, key, coerceValue(value, {flag: field, readFile, stdin}))
  }

  return result
}

function splitField(input: string, flagName: string): {key: string; value: string} {
  const separatorIndex = input.indexOf('=')
  if (separatorIndex < 1) {
    throw new ApiUsageError(`Invalid ${flagName} "${input}": expected key=value format`)
  }
  return {key: input.slice(0, separatorIndex), value: input.slice(separatorIndex + 1)}
}

function coerceValue(
  value: string,
  context: {flag: string; readFile?: (path: string) => string; stdin?: string},
): FieldValue {
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null') return null
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)

  if (value.startsWith('@')) {
    const source = value.slice(1)
    if (source === '-') {
      if (context.stdin === undefined) {
        throw new ApiUsageError(`Unable to read stdin for field "${context.flag}"`)
      }
      return context.stdin
    }
    if (!context.readFile) {
      throw new ApiUsageError(`Unable to read file for field "${context.flag}"`)
    }
    try {
      return context.readFile(source)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new ApiUsageError(`Failed to read "${source}" for field "${context.flag}": ${message}`)
    }
  }

  return value
}

/**
 * Set a (possibly nested) field on the target object, `gh api`-style:
 * `a=1` sets a top-level key, `a[b]=1` a nested object key, and `a[]=1`
 * appends to an array.
 */
function setField(target: Record<string, FieldValue>, key: string, value: FieldValue): void {
  const match = KEY_RE.exec(key)
  if (!match) {
    throw new ApiUsageError(`Invalid field key "${key}"`)
  }

  const [, head, brackets] = match
  const path: string[] = [head]
  if (brackets) {
    for (const part of brackets.matchAll(/\[([^[\]]*)\]/g)) {
      path.push(part[1])
    }
  }

  let container: FieldValue[] | Record<string, FieldValue> = target
  for (const [index, segment] of path.entries()) {
    const isLast = index === path.length - 1
    const nextIsArray = !isLast && path[index + 1] === ''

    if (Array.isArray(container)) {
      if (segment !== '') {
        throw new ApiUsageError(`Invalid field key "${key}": expected [] for array values`)
      }
      if (isLast) {
        container.push(value)
        return
      }
      const next: FieldValue = nextIsArray ? [] : Object.create(null)
      container.push(next)
      container = next as FieldValue[] | Record<string, FieldValue>
      continue
    }

    if (segment === '') {
      throw new ApiUsageError(`Invalid field key "${key}": missing key before []`)
    }

    if (isLast) {
      if (Object.hasOwn(container, segment)) {
        throw new ApiUsageError(`Field "${key}" conflicts with an earlier field`)
      }
      container[segment] = value
      return
    }

    const existing = Object.hasOwn(container, segment) ? container[segment] : undefined
    if (existing === undefined) {
      container[segment] = nextIsArray ? [] : Object.create(null)
    } else if (typeof existing !== 'object' || existing === null) {
      throw new ApiUsageError(`Field "${key}" conflicts with an earlier field`)
    }
    container = container[segment] as FieldValue[] | Record<string, FieldValue>
  }
}
