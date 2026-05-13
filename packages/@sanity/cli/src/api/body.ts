/**
 * Request body construction for `sanity api <endpoint>`.
 *
 * Three mutually exclusive input modes:
 *
 *   - `-f key=value` (repeatable) → builds a JSON object. Each value
 *     is parsed as JSON if it parses, falling back to a string. Keys
 *     containing `.` create nested objects (`profile.name=Bob` →
 *     `{profile: {name: "Bob"}}`).
 *   - `-F key=@path` (repeatable) → loads `path` from disk and slots
 *     the contents into the JSON object under `key`. Used for inline
 *     attachments without inflating shell argv.
 *   - `--input <path>` (or `--input -` for stdin) → reads the entire
 *     body verbatim. The CLI does not parse or re-serialize; whatever
 *     bytes the file holds go on the wire.
 *
 * `-H 'Header: Value'` is orthogonal to body construction and stacks
 * regardless of which body mode (if any) is in play. Repeatable.
 *
 * The module's job is to translate flag inputs into a `BuildBodyResult`
 * — the command layer handles error copy and exit codes.
 */

import {readFile} from 'node:fs/promises'

interface BuildBodyResult {
  /** Body bytes / string. `null` when the method doesn't carry a body. */
  body: string | null
  /** `Content-Type` to send. `null` when the body is null. */
  contentType: string | null
}

interface BodyInputs {
  /** Field assignments from `-f key=value`. */
  fieldPairs: readonly string[]
  /** File-backed field assignments from `-F key=@path`. */
  filePairs: readonly string[]
  /** Path for `--input`. `'-'` reads stdin. `null` means no `--input`. */
  inputPath: string | null
  /** Uppercase HTTP method — used to enforce method/body compatibility. */
  method: string

  /**
   * Optional schema hint surfaced when the method requires a body but
   * the user provided none. Lets the error name the operation's
   * required fields and point at `sanity api spec` for the full
   * schema, instead of just saying "needs a body" generically.
   */
  schemaHint?: {
    /** Suggestion to run for full schema details (already formatted). */
    docsCommand?: string
    /** Names of the operation's top-level required body fields. */
    requiredFields?: string[]
  }
}

/** Methods that may not carry a request body in HTTP semantics. */
const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Methods that *must* carry a request body for the operations we
 * route through this command. The OpenAPI spec dictates the actual
 * requirement per-operation; this set is a safety net for the
 * common case (POST/PUT/PATCH almost always have one).
 */
const BODY_METHODS = new Set(['PATCH', 'POST', 'PUT'])

/**
 * Build the request body from flag inputs. Returns `{body: null}`
 * when the method is bodyless *and* no body flags were passed.
 *
 * Errors are thrown — callers translate to oclif `this.error()`.
 * Throwing means the function never has to know about exit codes.
 */
export async function buildRequestBody(inputs: BodyInputs): Promise<BuildBodyResult> {
  const {fieldPairs, filePairs, inputPath, method, schemaHint} = inputs

  const hasFields = fieldPairs.length > 0 || filePairs.length > 0
  const hasInput = inputPath !== null
  const hasAnyBody = hasFields || hasInput

  if (BODYLESS_METHODS.has(method)) {
    if (hasAnyBody) {
      throw new Error(
        `${method} requests cannot carry a body. ` +
          `Drop -f/-F/--input or use -X with a body-bearing method (POST/PUT/PATCH).`,
      )
    }
    return {body: null, contentType: null}
  }

  if (hasFields && hasInput) {
    throw new Error(
      '-f/-F and --input are mutually exclusive. ' +
        '-f/-F builds a JSON object from flags; --input sends a file or stdin verbatim.',
    )
  }

  if (hasInput) {
    const raw = await readInputSource(inputPath)
    return {body: raw, contentType: detectContentType(raw)}
  }

  if (hasFields) {
    const payload = await buildFieldObject(fieldPairs, filePairs)
    return {body: JSON.stringify(payload), contentType: 'application/json'}
  }

  if (BODY_METHODS.has(method)) {
    throw new Error(formatBodyRequiredError(method, schemaHint))
  }

  return {body: null, contentType: null}
}

/**
 * Read `--input` source. `'-'` reads stdin; any other value is a file
 * path resolved against the process cwd. Returned verbatim — no
 * trailing-newline trimming or transcoding.
 */
async function readInputSource(path: string): Promise<string> {
  if (path === '-') return readStdin()
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Cannot read --input file "${path}": ${message}`, {cause: error})
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Quick content-type heuristic on the raw input bytes. */
function detectContentType(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed)
      return 'application/json'
    } catch {
      // fall through
    }
  }
  return 'application/octet-stream'
}

/**
 * Merge `-f key=value` and `-F key=@path` pairs into a plain JS
 * object. Dotted keys nest. Value parsing rules:
 *
 *   - `-f`: try `JSON.parse(value)`; on failure, keep as string.
 *   - `-F`: read file contents; try to parse as JSON if it looks
 *           like JSON, else slot in as a string.
 */
async function buildFieldObject(
  fieldPairs: readonly string[],
  filePairs: readonly string[],
): Promise<Record<string, unknown>> {
  const root: Record<string, unknown> = {}

  for (const pair of fieldPairs) {
    const {key, raw} = splitFieldPair(pair, '-f')
    assignDotted(root, key, parseJsonOrString(raw))
  }

  for (const pair of filePairs) {
    const {key, raw} = splitFieldPair(pair, '-F')
    if (!raw.startsWith('@')) {
      throw new Error(`-F ${key}=${raw}: file values must start with @ (got "${raw}").`)
    }
    const path = raw.slice(1)
    const contents = await readFile(path, 'utf8').catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`-F ${key}=@${path}: cannot read file: ${message}`)
    })
    assignDotted(root, key, parseJsonOrString(contents))
  }

  return root
}

function splitFieldPair(pair: string, flag: string): {key: string; raw: string} {
  const eq = pair.indexOf('=')
  if (eq === -1) {
    throw new Error(`${flag} values must be in key=value form (got "${pair}").`)
  }
  const key = pair.slice(0, eq)
  if (key.length === 0) {
    throw new Error(`${flag} ${pair}: key must be non-empty.`)
  }
  return {key, raw: pair.slice(eq + 1)}
}

/** Try JSON-parsing; fall back to the original string on any error. */
function parseJsonOrString(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * Assign `value` to `key` (possibly dotted) under `root`. Intermediate
 * objects are created as needed. Existing non-object intermediates
 * (e.g. someone set `foo=1` then `foo.bar=2`) throw — silent overwrite
 * would mask user error.
 */
function assignDotted(root: Record<string, unknown>, key: string, value: unknown): void {
  const segments = key.split('.')
  let cursor: Record<string, unknown> = root
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!
    const existing = cursor[segment]
    if (existing === undefined) {
      const next: Record<string, unknown> = {}
      cursor[segment] = next
      cursor = next
    } else if (isPlainObject(existing)) {
      cursor = existing
    } else {
      throw new Error(
        `Cannot set "${key}": "${segments.slice(0, i + 1).join('.')}" already holds a non-object value.`,
      )
    }
  }
  cursor[segments.at(-1)!] = value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse repeated `-H 'Name: Value'` flag values into a header map.
 * Later occurrences of the same header overwrite earlier ones —
 * predictable for users who pipe through a wrapper script.
 *
 * Returns lower-cased keys for stable lookup; HTTP header names are
 * case-insensitive.
 */
/**
 * Format the "method needs a body" error. When the operation hints at
 * required fields and where to read the schema, surface both so the
 * caller (often an agent) can fix the request on the next try without
 * an exploratory round-trip.
 */
function formatBodyRequiredError(
  method: string,
  hint?: {docsCommand?: string; requiredFields?: string[]},
): string {
  const lines = [`${method} needs a request body.`]
  if (hint?.requiredFields && hint.requiredFields.length > 0) {
    lines.push(`Required fields: ${hint.requiredFields.join(', ')}`)
  }
  lines.push('Pass -f key=value (JSON object), -F key=@path (file), or --input <path>.')
  if (hint?.docsCommand) {
    lines.push(`For the full schema: ${hint.docsCommand}`)
  }
  return lines.join('\n')
}

export function parseHeaderFlags(headerPairs: readonly string[]): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const raw of headerPairs) {
    const colon = raw.indexOf(':')
    if (colon === -1) {
      throw new Error(`-H values must be in "Name: Value" form (got "${raw}").`)
    }
    const name = raw.slice(0, colon).trim()
    if (name.length === 0) {
      throw new Error(`-H ${raw}: header name must be non-empty.`)
    }
    headers[name.toLowerCase()] = raw.slice(colon + 1).trim()
  }
  return headers
}
