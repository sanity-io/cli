import {validateMediaLibraryAssetAspect} from '@sanity/schema/_internal'
import {type SchemaValidationProblem} from '@sanity/types'
import startCase from 'lodash-es/startCase.js'

import {type StoredAspectDocument} from '../../services/mediaLibraries.js'
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
export type PullableAspectDocument = StoredAspectDocument

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
 * Convert a page of stored aspect documents into field modules, one per field
 * name. Two stored documents can resolve to the same name (a legacy document
 * whose `_id` predates its `definition.name`), which would otherwise produce
 * the same module twice — the document whose `_id` matches the name wins, the
 * rest are reported as skipped. Shared by `sanity media pull-aspects` and the
 * init-time pull offer.
 *
 * @internal
 */
export function convertAspectDocuments(documents: PullableAspectDocument[]): {
  modules: GeneratedFieldModule[]
  skipped: SkippedAspect[]
} {
  const skipped: SkippedAspect[] = []

  // First pass: convert every stored document.
  const candidates: Array<{module: GeneratedFieldModule; sourceId: string}> = []
  for (const doc of documents) {
    const outcome = aspectDocumentToFieldModule(doc)
    if (outcome.status === 'skipped') {
      skipped.push(outcome)
    } else {
      candidates.push({module: outcome, sourceId: String(doc._id)})
    }
  }

  // Second pass: pick one winner per name.
  const byName = new Map<string, Array<{module: GeneratedFieldModule; sourceId: string}>>()
  for (const candidate of candidates) {
    const group = byName.get(candidate.module.name) ?? []
    group.push(candidate)
    byName.set(candidate.module.name, group)
  }
  const modules: GeneratedFieldModule[] = []
  for (const [name, group] of byName) {
    const winner = group.find((candidate) => candidate.sourceId === name) ?? group[0]
    modules.push(winner.module)
    for (const loser of group) {
      if (loser === winner) continue
      skipped.push({
        id: loser.sourceId,
        reasons: [`Also defines "${name}" — generated from "${winner.sourceId}" instead`],
        status: 'skipped',
        validationErrors: [],
      })
    }
  }

  return {modules, skipped}
}

/**
 * Codegen one stored aspect document into a `src/fields/<name>.tsx` field
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
    // .tsx although the generated content has no JSX: field modules are
    // expected to grow custom input components (the one thing the stored
    // aspect could not carry), and a later rename would also mean fixing the
    // `src:` entry in sanity.cli.ts. Matches the template's example modules.
    filename: `${name}.tsx`,
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
 * generated module. When `writtenPaths` (module name to root-relative path)
 * has an entry for a module, that path wins — the module may have replaced an
 * existing file (e.g. a `.tsx` variant) rather than landing at the default
 * `<srcDir>/<filename>` location.
 *
 * @internal
 */
export function formatFieldEntries(
  modules: GeneratedFieldModule[],
  srcDir: string,
  writtenPaths?: Map<string, string>,
): string {
  const dir = srcDir.replaceAll('\\', '/').replace(/\/+$/, '')
  return modules
    .map((module) => {
      const src =
        writtenPaths?.get(module.name)?.replaceAll('\\', '/') ?? `${dir}/${module.filename}`
      const publicPart = module.public === undefined ? '' : `, public: ${module.public}`
      return `{name: '${module.name}', src: './${src}', title: ${quote(module.title)}${publicPart}},`
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
