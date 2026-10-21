import {validateMediaLibraryAssetAspect} from '@sanity/schema/_internal'
import {type SchemaValidationProblem} from '@sanity/types'
import startCase from 'lodash-es/startCase.js'

import {VALID_ASPECT_NAME} from './aspectName.js'

/** Keys whose object members are schema definitions, printed wrapped in a definer call. */
const DEFINER_BY_PARENT_KEY: Record<string, string> = {
  fields: 'defineField',
  of: 'defineArrayMember',
}

const IDENTIFIER_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** Scalar arrays shorter than this print inline (e.g. `options.list`). */
const INLINE_ARRAY_MAX_WIDTH = 60

/**
 * The stored `sanity.asset.aspect` document shape this migration reads.
 * Deliberately loose: documents may predate the config model (authored via
 * `sanity media deploy-aspect` or by hand) and carry fields the model has no
 * equivalent for.
 */
export interface PullableAspectDocument {
  _id: string

  assetType?: unknown
  definition?: unknown
  public?: unknown
}

export interface GeneratedFieldModule {
  filename: string
  /** The `aspects.<name>` data key — module filename and config entry name. */
  name: string
  source: string
  status: 'generated'
  title: string
  warnings: string[]

  public?: boolean
}

export interface SkippedAspect {
  id: string
  reasons: string[]
  status: 'skipped'
  validationErrors: SchemaValidationProblem[][]
}

export type PullAspectOutcome = GeneratedFieldModule | SkippedAspect

/**
 * Codegen one stored aspect document into a `src/fields/<name>.ts` field
 * module for a Media Library config app.
 *
 * Stored aspects are migration-ready by construction: `definition` is the
 * JSON-serialized `defineField(...)` value with functions and component
 * references already stripped, so generation is mechanical pretty-printing
 * into a `defineField({...})` call (nested `fields`/`of` members wrapped in
 * `defineField`/`defineArrayMember`, matching hand-authored style).
 *
 * Edge cases handled here, not silently:
 *
 * - `_id` vs `definition.name` mismatch: the module is generated under
 *   `definition.name` — the `aspects.<name>` key existing asset data lives
 *   under. Normalizing onto `_id` instead would silently orphan that data.
 *   The old document (keyed `_id`) is reported for manual deletion.
 * - `assetType` has no equivalent in the config model; a document carrying it
 *   generates with a warning that the scoping is lost.
 * - Definitions failing current schema validation are skipped with the
 *   validation errors, mirroring `sanity media deploy-aspect`.
 *
 * Pure (no I/O): the command decides where modules are written.
 *
 * @internal
 */
export function aspectDocumentToFieldModule(doc: PullableAspectDocument): PullAspectOutcome {
  const {_id} = doc

  if (!isRecord(doc.definition)) {
    return {
      id: _id,
      reasons: ['The stored document has no field definition object'],
      status: 'skipped',
      validationErrors: [],
    }
  }

  const definitionName = typeof doc.definition.name === 'string' ? doc.definition.name : undefined
  const name = definitionName ?? _id

  if (!VALID_ASPECT_NAME.test(name)) {
    return {
      id: _id,
      reasons: [
        `"${name}" is not a valid field name (${VALID_ASPECT_NAME}) — it becomes the module name and the aspects.<name> key on assets`,
      ],
      status: 'skipped',
      validationErrors: [],
    }
  }

  const warnings: string[] = []

  if (definitionName === undefined) {
    warnings.push(`The stored definition has no name — using the document _id "${_id}"`)
  } else if (definitionName !== _id) {
    warnings.push(
      `Stored _id "${_id}" and definition name "${definitionName}" differ. Generated as ` +
        `"${definitionName}" — the aspects.<name> key existing asset data lives under; using ` +
        `"${_id}" would orphan that data. Deploying the config creates "${definitionName}" ` +
        `and leaves the old "${_id}" document behind — remove it with ` +
        `\`sanity media delete-aspect ${_id}\` once migrated.`,
    )
  }

  if (doc.assetType !== undefined && doc.assetType !== null) {
    warnings.push(
      `The stored document scopes the aspect by assetType (${JSON.stringify(doc.assetType)}), ` +
        `which has no equivalent in the config model — the generated field applies to all ` +
        `asset types, and syncing the config drops the scoping.`,
    )
  }

  // Normalize the name in before validating, so a document that only carries
  // its name as `_id` isn't rejected for the missing property.
  const definition: Record<string, unknown> = definitionName
    ? doc.definition
    : {name, ...doc.definition}

  const [valid, validationErrors] = validateMediaLibraryAssetAspect(definition)
  if (!valid) {
    return {
      id: _id,
      reasons: ['The stored definition fails schema validation'],
      status: 'skipped',
      validationErrors,
    }
  }

  return {
    filename: `${name}.ts`,
    name,
    ...(typeof doc.public === 'boolean' ? {public: doc.public} : {}),
    source: printFieldModule(definition),
    status: 'generated',
    title: typeof definition.title === 'string' ? definition.title : startCase(name),
    warnings,
  }
}

/**
 * The paste-ready `fields: [...]` entries for `sanity.cli.ts`, one line per
 * generated module.
 *
 * @internal
 */
export function formatFieldEntries(modules: GeneratedFieldModule[], srcDir: string): string {
  const dir = srcDir.replaceAll('\\', '/').replace(/\/+$/, '')
  return modules
    .map((module) => {
      const publicPart = module.public === undefined ? '' : `, public: ${module.public}`
      return `{name: '${module.name}', src: './${dir}/${module.filename}', title: ${quote(module.title)}${publicPart}},`
    })
    .join('\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface PrinterState {
  usesDefineArrayMember: boolean
}

function printFieldModule(definition: Record<string, unknown>): string {
  const state: PrinterState = {usesDefineArrayMember: false}
  const literal = printObject(definition, '', state)
  const imports = state.usesDefineArrayMember ? 'defineArrayMember, defineField' : 'defineField'

  return `import {${imports}} from 'sanity'\n\nexport default defineField(${literal})\n`
}

function quote(value: string): string {
  const escaped = value
    .replaceAll('\\', '\\\\')
    .replaceAll("'", String.raw`\'`)
    .replaceAll('\n', String.raw`\n`)
    .replaceAll('\r', String.raw`\r`)
    .replaceAll('\t', String.raw`\t`)
  return `'${escaped}'`
}

function printKey(key: string): string {
  return IDENTIFIER_KEY.test(key) ? key : quote(key)
}

function printValue(
  value: unknown,
  indent: string,
  parentKey: string | null,
  state: PrinterState,
): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return quote(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return printArray(value, indent, parentKey, state)
  if (isRecord(value)) return printObject(value, indent, state)
  // Stored definitions are JSON documents; anything else cannot occur.
  throw new TypeError(`Cannot print value of type ${typeof value}`)
}

function printArray(
  items: unknown[],
  indent: string,
  parentKey: string | null,
  state: PrinterState,
): string {
  if (items.length === 0) return '[]'

  const allScalar = items.every(
    (item) => item === null || ['boolean', 'number', 'string'].includes(typeof item),
  )
  if (allScalar) {
    const inline = `[${items.map((item) => printValue(item, indent, null, state)).join(', ')}]`
    if (inline.length <= INLINE_ARRAY_MAX_WIDTH) return inline
  }

  const definer = parentKey === null ? undefined : DEFINER_BY_PARENT_KEY[parentKey]
  const innerIndent = `${indent}  `
  const lines = items.map((item) => {
    if (definer !== undefined && isRecord(item)) {
      if (definer === 'defineArrayMember') state.usesDefineArrayMember = true
      return `${innerIndent}${definer}(${printObject(item, innerIndent, state)}),`
    }
    return `${innerIndent}${printValue(item, innerIndent, null, state)},`
  })
  return `[\n${lines.join('\n')}\n${indent}]`
}

function printObject(obj: Record<string, unknown>, indent: string, state: PrinterState): string {
  const entries = Object.entries(obj).filter(([, value]) => value !== undefined)
  if (entries.length === 0) return '{}'

  const innerIndent = `${indent}  `
  const lines = entries.map(
    ([key, value]) =>
      `${innerIndent}${printKey(key)}: ${printValue(value, innerIndent, key, state)},`,
  )
  return `{\n${lines.join('\n')}\n${indent}}`
}
