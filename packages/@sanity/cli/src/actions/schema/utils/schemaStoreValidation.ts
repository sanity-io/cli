import {CLIError} from '@oclif/core/errors'
import {
  type ParsedWorkspaceSchemaId,
  parseWorkspaceSchemaId,
  validForNamesChars,
  validForNamesPattern,
} from '@sanity/schema/_internal'
import uniqBy from 'lodash-es/uniqBy.js'

import {isDefined} from '../../../util/isDefined.js'

export function parseIds(ids?: string): ParsedWorkspaceSchemaId[] {
  if (!ids) {
    throw new CLIError('ids argument is empty')
  }

  const errors: string[] = []

  const parsedIds = ids
    .split(',')
    .map((id) => id.trim())
    .filter((id) => !!id)
    .map((id) => parseWorkspaceSchemaId(id, errors))
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

export const SCHEMA_PERMISSION_HELP_TEXT =
  'For multi-project workspaces, set SANITY_AUTH_TOKEN environment variable to a token with access to the workspace projects.'
