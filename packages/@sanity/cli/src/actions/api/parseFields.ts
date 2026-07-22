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

type FieldContainer = Record<string, FieldValue>

const KEY_RE = /^([^=[\]]+)((?:\[[^[\]]*\])*)$/

/**
 * Convert parsed fields to query parameters, for request methods without a
 * body (GET/HEAD). Only scalar values (and arrays of scalars) are supported.
 */
export function fieldsToQuery(
  fields: Record<string, FieldValue>,
): Record<string, string | string[]> {
  // Null-prototype for the same reason as in parseFields.
  const query: Record<string, string | string[]> = Object.create(null)

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
 * Supports nested keys with bracket syntax: `a[b]=1` produces `{a: {b: 1}}`,
 * `a[]=1` appends to an array and a bare `a[]` declares an empty one.
 * Raw fields (`-f`) keep values as strings; typed fields (`-F`) convert
 * `true`/`false`/`null` and numbers, and expand `@<file>` / `@-` to file or
 * stdin contents.
 */
export function parseFields(options: ParseFieldsOptions): Record<string, FieldValue> {
  const {fields = [], rawFields = [], readFile, stdin} = options
  // Null-prototype containers keep user-supplied keys like `__proto__` or
  // `toString` ordinary own properties: nothing to pollute, nothing inherited.
  const result: FieldContainer = Object.create(null)

  for (const raw of rawFields) {
    const {key, value} = splitField(raw, '--raw-field')
    setField(result, key, value)
  }

  for (const field of fields) {
    const {key, value} = splitField(field, '--field')
    setField(
      result,
      key,
      value === undefined ? undefined : coerceValue(value, {flag: field, readFile, stdin}),
    )
  }

  return result
}

function splitField(input: string, flagName: string): {key: string; value?: string} {
  const separatorIndex = input.indexOf('=')
  // A bare `key[]` without a value declares an empty array (gh api parity)
  if (separatorIndex === -1 && input.endsWith('[]')) {
    return {key: input}
  }
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
 * `a=1` sets a top-level key, `a[b]=1` a nested object key, `a[]=1` appends
 * to an array and a bare `a[]` declares an empty one (`value` is `undefined`).
 *
 * Array elements accumulate the way they do in gh: consecutive fields keep
 * filling the current (last) element - `a[][k]=1 a[][j]=2` builds one object
 * with both keys - until a key repeats, which starts the next element.
 */
function setField(target: FieldContainer, key: string, value: FieldValue | undefined): void {
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

  let container = target
  let subkey = ''
  let inArray = false
  for (const segment of path) {
    if (segment === '') {
      inArray = true
      continue
    }
    if (subkey !== '') {
      container = inArray
        ? descendIntoArray(container, subkey, segment, key)
        : descendIntoObject(container, subkey, key)
      inArray = false
    }
    subkey = segment
  }

  if (inArray) {
    const existing = Object.hasOwn(container, subkey) ? container[subkey] : undefined
    if (existing !== undefined && !Array.isArray(existing)) {
      throw new ApiUsageError(`Field "${key}" conflicts with an earlier field`)
    }
    const values = Array.isArray(existing) ? existing : []
    if (existing === undefined) {
      container[subkey] = values
    }
    if (value !== undefined) {
      values.push(value)
    }
    return
  }

  if (Object.hasOwn(container, subkey)) {
    throw new ApiUsageError(`Field "${key}" conflicts with an earlier field`)
  }
  // A `value` of undefined only occurs for keys ending in `[]`, which take
  // the array branch above.
  container[subkey] = value as FieldValue
}

/** Descend into (creating if needed) the object at `container[segment]`. */
function descendIntoObject(
  container: FieldContainer,
  segment: string,
  key: string,
): FieldContainer {
  const existing = Object.hasOwn(container, segment) ? container[segment] : undefined
  if (existing === undefined) {
    const next: FieldContainer = Object.create(null)
    container[segment] = next
    return next
  }
  if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
    throw new ApiUsageError(`Field "${key}" conflicts with an earlier field`)
  }
  return existing
}

/**
 * Descend into the array at `container[segment]`, returning the object
 * element the field at hand should land in: the current (last) element while
 * `nextKey` is new to it or accumulating a nested array, or a freshly
 * appended element once `nextKey` repeats (gh api semantics).
 */
function descendIntoArray(
  container: FieldContainer,
  segment: string,
  nextKey: string,
  key: string,
): FieldContainer {
  const existing = Object.hasOwn(container, segment) ? container[segment] : undefined
  if (existing !== undefined && !Array.isArray(existing)) {
    throw new ApiUsageError(`Field "${key}" conflicts with an earlier field`)
  }
  const values = Array.isArray(existing) ? existing : []
  if (existing === undefined) {
    container[segment] = values
  }

  const last = values.at(-1)
  if (
    typeof last === 'object' &&
    last !== null &&
    !Array.isArray(last) &&
    (!Object.hasOwn(last, nextKey) || Array.isArray(last[nextKey]))
  ) {
    return last
  }

  const next: FieldContainer = Object.create(null)
  values.push(next)
  return next
}
