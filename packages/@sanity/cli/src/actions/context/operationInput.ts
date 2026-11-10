import {Args, Flags} from '@oclif/core'
import {type ArgInput, type FlagInput} from '@oclif/core/interfaces'

import {getOrganizationFlag} from '../../util/sharedFlags.js'
import {type ContextCommandEntry} from './commandTable.js'
import {type ContextOperation, type OperationField} from './operationTypes.js'

const ORGANIZATION = 'organizationId'
const NULL = 'null'

/** What a command sends: the path parameters, query and body of `client.context.request` */
export interface OperationRequest {
  params: Record<string, string>
  query: Record<string, string>

  body?: Record<string, unknown>
}

type Values = Readonly<Record<string, unknown>>

/** `includePaths` → `include-paths` */
export function flagName(field: Pick<OperationField, 'name'>): string {
  return field.name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

const ACRONYMS = new Set(['api', 'groq', 'id', 'ids', 'mcp', 'url', 'uuid'])

/** `openIssueCount` → `Open issue count`, `sourceId` → `Source ID` */
export function humanize(name: string): string {
  const words = name
    .replaceAll(/([a-z\d])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .toLowerCase()
    .split(' ')
    .map((word) => (ACRONYMS.has(word) ? word.toUpperCase().replace(/S$/, 's') : word))
    .join(' ')
  return `${words[0].toUpperCase()}${words.slice(1)}`
}

/** Whether the command resolves an organization: from `--organization`, the CLI config, or a prompt */
export function needsOrganization(operation: ContextOperation): boolean {
  return (
    operation.pathParams.some((param) => param.name === ORGANIZATION) ||
    operation.fields.some((field) => field.name === ORGANIZATION)
  )
}

/** The fields that become flags: not the organization, a variadic argument, an omitted field or a page cursor. A list's `limit` caps the total its pages add up to */
function flagFields(operation: ContextOperation, entry: ContextCommandEntry): OperationField[] {
  const omit = new Set<string>(entry.omit)
  return operation.fields.filter(
    (field) =>
      field.name !== ORGANIZATION &&
      field.name !== entry.variadicArg &&
      !omit.has(field.name) &&
      !(operation.paginated && field.in === 'query' && field.name === 'cursor'),
  )
}

function describe(field: OperationField): string {
  const notes = [
    field.variants && `Only for type ${field.variants.join(' or ')}.`,
    field.nullable && 'Pass `null` to clear it.',
  ].filter(Boolean)
  return [field.description ?? `${humanize(field.name)}.`, ...notes].join(' ')
}

/** The `type` of a body with variants, which the variant's own fields can stand in for */
function isDiscriminator(operation: ContextOperation, field: OperationField): boolean {
  return (
    field.in === 'body' &&
    field.name === 'type' &&
    !field.parent &&
    operation.fields.some((other) => other.variants)
  )
}

function fieldFlag(field: OperationField, inferred: boolean) {
  const base = {
    description: inferred
      ? `${describe(field)} Inferred from the other flags when left out.`
      : describe(field),
    ...(field.required && !field.variants && !inferred && {required: true}),
  }
  switch (field.type) {
    case 'boolean': {
      return Flags.boolean({...base, allowNo: true})
    }
    case 'integer': {
      return field.nullable ? Flags.string(base) : Flags.integer(base)
    }
    case 'json': {
      return Flags.string({...base, helpValue: '<json>'})
    }
    case 'string[]': {
      return Flags.string({...base, multiple: true})
    }
    default: {
      const options = field.options && [...field.options, ...(field.nullable ? [NULL] : [])]
      return Flags.string({...base, ...(options && {options})})
    }
  }
}

/** A flag's value as the field's wire value: `null` to clear, parsed JSON or numbers */
function wireValue(field: OperationField, value: unknown): unknown {
  if (typeof value !== 'string') return value
  if (field.nullable && value === NULL) return null
  if (field.type === 'json') {
    try {
      return JSON.parse(value)
    } catch {
      throw new Error(`\`--${flagName(field)}\` must be JSON`)
    }
  }
  if (field.type === 'integer' || field.type === 'number') {
    const number = Number(value)
    if (value.trim() === '' || Number.isNaN(number)) {
      throw new Error(`\`--${flagName(field)}\` must be a number`)
    }
    return number
  }
  return value
}

/** The flags of an operation's command: one per query or body field */
export function operationFlags(operation: ContextOperation, entry: ContextCommandEntry): FlagInput {
  const flags: FlagInput = Object.fromEntries(
    flagFields(operation, entry).map((field) => [
      flagName(field),
      fieldFlag(field, isDiscriminator(operation, field)),
    ]),
  )
  if (needsOrganization(operation)) {
    Object.assign(
      flags,
      getOrganizationFlag({description: 'Organization ID', semantics: 'override'}),
    )
  }
  if (entry.watch) {
    flags.watch = Flags.boolean({
      default: false,
      description:
        entry.watch === 'job'
          ? 'Wait for the job to finish, exiting non-zero if it fails'
          : 'Wait for the sync to settle, exiting non-zero unless it completes: when it fails, is cancelled or is held for confirmation',
    })
  }
  if (operation.route.startsWith('DELETE ')) {
    flags.yes = Flags.boolean({
      char: 'y',
      default: false,
      description: 'Skip confirmation prompt (unattended mode)',
    })
  }
  return flags
}

/** The arguments of an operation's command: its path parameters, then a variadic body field */
export function operationArgs(operation: ContextOperation, entry: ContextCommandEntry): ArgInput {
  const args: ArgInput = {}
  for (const param of operation.pathParams) {
    if (param.name === ORGANIZATION) continue
    args[param.name] = Args.string({
      description: param.description ?? humanize(param.name),
      required: true,
    })
  }
  const variadic = operation.fields.find((field) => field.name === entry.variadicArg)
  if (variadic) {
    args[variadic.name] = Args.string({
      description: describe(variadic),
      multiple: true,
      required: true,
    })
  }
  return args
}

/** Option flags whose values can hold free text, URLs or customer data, which telemetry leaves out */
export function redactedFlags(operation: ContextOperation, entry: ContextCommandEntry): string[] {
  return flagFields(operation, entry)
    .filter(
      (field) =>
        (field.type === 'string' && !field.options) ||
        field.type === 'string[]' ||
        field.type === 'json',
    )
    .map((field) => flagName(field))
}

function setNested(target: Record<string, unknown>, path: string[], value: unknown): void {
  const [key, ...rest] = path
  if (rest.length === 0) {
    target[key] = value
    return
  }
  const existing = target[key]
  const nested: Record<string, unknown> =
    typeof existing === 'object' && existing !== null ? {...existing} : {}
  setNested(nested, rest, value)
  target[key] = nested
}

/** The variant of a discriminated body the given fields belong to, when exactly one fits */
function inferVariant(operation: ContextOperation, given: OperationField[]): string | undefined {
  const discriminator = operation.fields.find((field) => isDiscriminator(operation, field))
  if (!discriminator?.options) return undefined
  const fits = discriminator.options.filter((variant) =>
    given.every((field) => !field.variants || field.variants.includes(variant)),
  )
  return fits.length === 1 ? fits[0] : undefined
}

/**
 * Build the request from a command's arguments and flags; throws on a flag
 * value the field can't take. Query booleans
 * travel as `true` or `false`; nested fields go back under their parent; a
 * discriminated body without `--type` gets the one variant its fields fit.
 */
export function buildOperationRequest(
  operation: ContextOperation,
  entry: ContextCommandEntry,
  input: {args: Values; flags: Values; organizationId?: string},
): OperationRequest {
  const {args, flags, organizationId} = input
  const params: Record<string, string> = {}
  for (const param of operation.pathParams) {
    const value = param.name === ORGANIZATION ? organizationId : args[param.name]
    if (typeof value === 'string') params[param.name] = value
  }

  const query: Record<string, string> = {}
  const body: Record<string, unknown> = {}
  const given: OperationField[] = []
  for (const field of operation.fields) {
    let value: unknown
    if (field.name === ORGANIZATION) value = organizationId
    else if (field.name === entry.variadicArg) value = args[field.name]
    else value = wireValue(field, flags[flagName(field)])
    if (value === undefined) continue
    given.push(field)

    if (field.in === 'query') {
      query[field.name] = String(value)
      continue
    }
    if (field.parent) {
      setNested(body, [...field.parent.split('.'), field.name], value)
      continue
    }
    body[field.name] = value
  }

  if (operation.body !== 'none' && body.type === undefined) {
    const variant = inferVariant(operation, given)
    if (variant) body.type = variant
  }

  const hasBody = operation.body === 'required' || Object.keys(body).length > 0
  return {params, query, ...(operation.body !== 'none' && hasBody && {body})}
}
