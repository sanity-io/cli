import {CLIError} from '@oclif/core/errors'
import {type Output} from '@sanity/cli-core'
import {uniqBy} from 'lodash-es'

import {isDefined} from '../../manifest/schemaTypeHelpers.js'
import {SANITY_WORKSPACE_SCHEMA_ID_PREFIX} from '../../manifest/types.js'

const validForIdChars = 'a-zA-Z0-9._-'
const validForIdPattern = new RegExp(`^[${validForIdChars}]+$`)

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

export function parseIds(ids?: string): WorkspaceSchemaId[] {
  if (!ids) {
    throw new CLIError('ids argument is empty')
  }

  const errors: string[] = []

  const parsedIds = ids
    .split(',')
    .map((id) => id.trim())
    .filter((id) => !!id)
    .map((id) => parseWorkspaceSchemaId(errors, id))
    .filter((item) => isDefined(item))

  if (errors.length > 0) {
    throw new CLIError(`Invalid arguments:\n${errors.map((error) => `  - ${error}`).join('\n')}`)
  }

  if (parsedIds.length === 0) {
    throw new CLIError(`ids contains no valid id strings`)
  }

  const uniqueIds = uniqBy(parsedIds, 'schemaId' satisfies keyof (typeof parsedIds)[number])
  if (uniqueIds.length < parsedIds.length) {
    throw new CLIError(`ids contains duplicates`)
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

/**
 *
 * @param tag - The tag to parse
 * Throws an error if the tag is empty
 * Throws an error if the tag contains a period
 * Throws an error if the tag starts with a dash
 * Returns the parsed tag
 */
export async function parseTag(tag?: string) {
  if (tag === undefined) {
    return tag
  }

  if (!tag) {
    throw new CLIError('tag argument is empty')
  }

  if (tag.includes('.')) {
    throw new CLIError(`tag cannot contain . (period), but was: "${tag}"`)
  }

  if (!validForNamesPattern.test(tag)) {
    throw new CLIError(
      `tag can only contain characters in [${validForNamesChars}], but was: "${tag}"`,
    )
  }

  if (tag.startsWith('-')) {
    throw new CLIError(`tag cannot start with - (dash) but was: "${tag}"`)
  }

  return tag
}

function getProjectIdMismatchMessage(
  workspace: {name: string; projectId: string},
  operation: 'read' | 'write',
) {
  return `No permissions to ${operation} schema for workspace "${workspace.name}" with projectId "${workspace.projectId}"`
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
