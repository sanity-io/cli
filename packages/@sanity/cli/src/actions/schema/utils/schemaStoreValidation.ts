import {type Output} from '@sanity/cli-core'

import {uniqBy} from '../../../util/uniqBy.js'
import {isDefined} from '../../manifest/schemaTypeHelpers.js'
import {SANITY_WORKSPACE_SCHEMA_ID_PREFIX} from '../../manifest/types.js'
import {type DeleteSchemaFlags} from '../deleteSchemaAction.js'

// TODO: These types will be imported from their respective files when migrated
export interface DeploySchemasFlags extends SchemaStoreCommonFlags {
  'schema-required'?: boolean
  tag?: string
  workspace?: string
}

export interface SchemaListFlags extends SchemaStoreCommonFlags {
  id?: string
  json?: boolean
}

export const validForIdChars = 'a-zA-Z0-9._-'
export const validForIdPattern = new RegExp(`^[${validForIdChars}]+$`)

//no periods allowed in workspaceName or tag in ids
export const validForNamesChars = 'a-zA-Z0-9_-'
export const validForNamesPattern = new RegExp(`^[${validForNamesChars}]+$`)

const requiredInId = SANITY_WORKSPACE_SCHEMA_ID_PREFIX.replaceAll(/[.]/g, String.raw`\.`)

const idIdPatternString = `^${requiredInId}\\.([${validForNamesChars}]+)`
const baseIdPattern = new RegExp(`${idIdPatternString}$`)
const taggedIdIdPattern = new RegExp(`${idIdPatternString}\\.tag\\.([${validForNamesChars}]+)$`)

export class FlagValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FlagValidationError'
  }
}

interface WorkspaceSchemaId {
  schemaId: string
  workspace: string
}

export interface SchemaStoreCommonFlags {
  'manifest-dir': string

  'extract-manifest'?: boolean
  'no-extract-manifest'?: boolean
  verbose?: boolean
}

function parseCommonFlags(flags: SchemaStoreCommonFlags) {
  const verbose = !!flags.verbose
  // extract manifest by default: our CLI layer handles both --extract-manifest (true) and --no-extract-manifest (false)
  const extractManifest = flags['extract-manifest'] ?? true

  return {
    extractManifest,
    manifestDir: flags['manifest-dir'],
    verbose,
  }
}

export function parseDeploySchemasConfig(flags: DeploySchemasFlags) {
  const errors: string[] = []

  const commonFlags = parseCommonFlags(flags)
  const workspaceName = parseWorkspace(flags, errors)
  const tag = parseTag(flags, errors)
  const schemaRequired = !!flags['schema-required']

  assertNoErrors(errors)
  return {...commonFlags, schemaRequired, tag, workspaceName}
}

export function parseListSchemasConfig(flags: SchemaListFlags) {
  const errors: string[] = []

  const commonFlags = parseCommonFlags(flags)
  const id = parseId(flags, errors)
  const json = !!flags.json

  assertNoErrors(errors)
  return {...commonFlags, id, json}
}

export function parseDeleteSchemasConfig(flags: DeleteSchemaFlags) {
  const errors: string[] = []

  const commonFlags = parseCommonFlags(flags)
  const ids = parseIds(flags, errors)
  const dataset = parseDataset(flags, errors)

  assertNoErrors(errors)
  return {...commonFlags, dataset, ids}
}

function assertNoErrors(errors: string[]) {
  if (errors.length > 0) {
    throw new FlagValidationError(
      `Invalid arguments:\n${errors.map((error) => `  - ${error}`).join('\n')}`,
    )
  }
}

export function parseIds(flags: {ids?: unknown}, errors: string[]): WorkspaceSchemaId[] {
  const parsedIds = parseNonEmptyString(flags, 'ids', errors)
  if (errors.length > 0) {
    return []
  }

  const ids = parsedIds
    .split(',')
    .map((id) => id.trim())
    .filter((id) => !!id)
    .map((id) => parseWorkspaceSchemaId(id, errors))
    .filter((item) => isDefined(item))

  const uniqueIds = uniqBy(ids, 'schemaId' satisfies keyof (typeof ids)[number])
  if (uniqueIds.length < ids.length) {
    errors.push(`ids contains duplicates`)
  }
  if (errors.length === 0 && uniqueIds.length === 0) {
    errors.push(`ids contains no valid id strings`)
  }
  return uniqueIds
}

export function parseId(flags: {id?: unknown}, errors: string[]) {
  const id = flags.id === undefined ? undefined : parseNonEmptyString(flags, 'id', errors)
  if (id) {
    return parseWorkspaceSchemaId(id, errors)?.schemaId
  }
  return
}

export function parseWorkspaceSchemaId(id: string, errors: string[]) {
  const trimmedId = id.trim()

  if (!validForIdPattern.test(trimmedId)) {
    errors.push(`id can only contain characters in [${validForIdChars}] but found: "${trimmedId}"`)
    return
  }

  if (trimmedId.startsWith('-')) {
    errors.push(`id cannot start with - (dash) but found: "${trimmedId}"`)
    return
  }

  if (/\.\./g.test(trimmedId)) {
    errors.push(`id cannot have consecutive . (period) characters, but found: "${trimmedId}"`)
    return
  }

  const [, workspace] = trimmedId.match(taggedIdIdPattern) ?? trimmedId.match(baseIdPattern) ?? []
  if (!workspace) {
    errors.push(
      [
        `id must either match ${SANITY_WORKSPACE_SCHEMA_ID_PREFIX}.<workspaceName> `,
        `or ${SANITY_WORKSPACE_SCHEMA_ID_PREFIX}.<workspaceName>.tag.<tag> but found: "${trimmedId}". `,
        `Note that workspace name characters not in [${validForNamesChars}] has to be replaced with _ for schema id.`,
      ].join(''),
    )
    return
  }
  return {
    schemaId: trimmedId,
    workspace,
  }
}

function parseDataset(flags: {dataset?: unknown}, errors: string[]) {
  return flags.dataset === undefined ? undefined : parseNonEmptyString(flags, 'dataset', errors)
}

function parseWorkspace(flags: {workspace?: unknown}, errors: string[]) {
  return flags.workspace === undefined ? undefined : parseNonEmptyString(flags, 'workspace', errors)
}

export function parseTag(flags: {tag?: unknown}, errors: string[]) {
  if (flags.tag === undefined) {
    return
  }

  const tag = parseNonEmptyString(flags, 'tag', errors)
  if (errors.length > 0) {
    return
  }

  if (tag.includes('.')) {
    errors.push(`tag cannot contain . (period), but was: "${tag}"`)
    return
  }

  if (!validForNamesPattern.test(tag)) {
    errors.push(`tag can only contain characters in [${validForNamesChars}], but was: "${tag}"`)
    return
  }

  if (tag.startsWith('-')) {
    errors.push(`tag cannot start with - (dash) but was: "${tag}"`)
    return
  }

  return tag
}

function parseNonEmptyString<
  Flag extends string,
  Flags extends Partial<Record<Flag, unknown | undefined>>,
>(flags: Flags, flagName: Flag, errors: string[]): string {
  const flag = flags[flagName]
  if (!isString(flag) || !flag) {
    errors.push(`${flagName} argument is empty`)
    return ''
  }
  return flag
}

function isString(flag: unknown): flag is string {
  return typeof flag === 'string'
}

function getProjectIdMismatchMessage(
  workspace: {name: string; projectId: string},
  operation: 'read' | 'write',
) {
  return `No permissions to ${operation} schema for workspace "${workspace.name}" with projectId "${workspace.projectId}"`
}

/**
 * At the moment schema store commands does not support studios where workspaces have multiple projects
 */
export function throwWriteProjectIdMismatch(
  workspace: {name: string; projectId: string},
  projectId: string,
): void {
  if (workspace.projectId !== projectId) {
    throw new Error(getProjectIdMismatchMessage(workspace, 'write'))
  }
}

export function filterLogReadProjectIdMismatch(
  workspace: {name: string; projectId: string},
  projectId: string,
  output: Output,
) {
  const canRead = workspace.projectId === projectId
  if (!canRead) output.warn(`${getProjectIdMismatchMessage(workspace, 'read')} – ignoring it.`)
  return canRead
}

export const SCHEMA_PERMISSION_HELP_TEXT =
  'For multi-project workspaces, set SANITY_AUTH_TOKEN environment variable to a token with access to the workspace projects.'
