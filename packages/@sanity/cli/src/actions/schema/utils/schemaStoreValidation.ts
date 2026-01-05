import {type Output} from '@sanity/cli-core'

import {uniqBy} from '../../../util/uniqBy.js'
import {isDefined} from '../../manifest/schemaTypeHelpers.js'
import {SANITY_WORKSPACE_SCHEMA_ID_PREFIX} from '../../manifest/types.js'

export const validForIdChars = 'a-zA-Z0-9._-'
export const validForIdPattern = new RegExp(`^[${validForIdChars}]+$`)

//no periods allowed in workspaceName or tag in ids
export const validForNamesChars = 'a-zA-Z0-9_-'
export const validForNamesPattern = new RegExp(`^[${validForNamesChars}]+$`)

const requiredInId = SANITY_WORKSPACE_SCHEMA_ID_PREFIX.replaceAll(/[.]/g, String.raw`\.`)

const idIdPatternString = String.raw`^${requiredInId}\.([${validForNamesChars}]+)`
const baseIdPattern = new RegExp(`${idIdPatternString}$`)
const taggedIdIdPattern = new RegExp(
  String.raw`${idIdPatternString}\.tag\.([${validForNamesChars}]+)$`,
)

export class FlagValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FlagValidationError'
  }
}

export interface WorkspaceSchemaId {
  schemaId: string
  workspace: string
}

export function validateDeployFlags(flags: {tag?: string; workspace?: string}) {
  const errors: string[] = []

  const tag = parseTag(errors, flags.tag)
  const workspaceName = parseWorkspace(errors, flags.workspace)

  if (errors.length > 0) {
    throw new FlagValidationError(
      `Invalid arguments:\n${errors.map((error) => `  - ${error}`).join('\n')}`,
    )
  }

  return {tag, workspaceName}
}

export function validateListFlags(flags: {id?: string}) {
  const errors: string[] = []

  const id = parseWorkspaceSchemaId(errors, flags.id)?.schemaId

  if (errors.length > 0) {
    throw new FlagValidationError(
      `Invalid arguments:\n${errors.map((error) => `  - ${error}`).join('\n')}`,
    )
  }

  return {id}
}

export function validateDeleteFlags(flags: {dataset?: string; ids?: string}) {
  const errors: string[] = []

  const dataset = parseDataset(errors, flags.dataset)
  const ids = parseIds(errors, flags.ids)

  if (errors.length > 0) {
    throw new FlagValidationError(
      `Invalid arguments:\n${errors.map((error) => `  - ${error}`).join('\n')}`,
    )
  }

  return {dataset, ids}
}

export function parseIds(errors: string[], ids?: string): WorkspaceSchemaId[] {
  if (!ids) {
    errors.push('ids argument is empty')
    return []
  }

  const parsedIds = ids
    .split(',')
    .map((id) => id.trim())
    .filter((id) => !!id)
    .map((id) => parseWorkspaceSchemaId(errors, id))
    .filter((item) => isDefined(item))

  const uniqueIds = uniqBy(parsedIds, 'schemaId' satisfies keyof (typeof parsedIds)[number])
  if (uniqueIds.length < parsedIds.length) {
    errors.push(`ids contains duplicates`)
  }
  if (errors.length === 0 && uniqueIds.length === 0) {
    errors.push(`ids contains no valid id strings`)
  }
  return uniqueIds
}

export function parseWorkspaceSchemaId(errors: string[], id?: string) {
  if (id === undefined) {
    return
  }

  if (!id) {
    errors.push('id argument is empty')
    return
  }

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

function parseDataset(errors: string[], dataset?: string) {
  if (dataset === undefined) {
    return
  }

  if (!dataset) {
    errors.push('dataset argument is empty')
    return
  }

  return dataset
}

function parseWorkspace(errors: string[], workspace?: string) {
  if (workspace === undefined) {
    return
  }

  if (!workspace) {
    errors.push('workspace argument is empty')
    return
  }

  return workspace
}

export function parseTag(errors: string[], tag?: string) {
  if (tag === undefined) {
    return
  }

  if (!tag) {
    errors.push('tag argument is empty')
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
