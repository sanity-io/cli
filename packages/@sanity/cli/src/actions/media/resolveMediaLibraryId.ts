import {CLIError} from '@oclif/core/errors'
import {exitCodes} from '@sanity/cli-core'

import {promptForMediaLibrary} from '../../prompts/promptForMediaLibrary.js'
import {getMediaLibrariesForOrganization, type MediaLibrary} from '../../services/mediaLibraries.js'

/**
 * The target-library resolution config-app media operations share: the flag
 * wins (validated against the organization's active libraries), a single
 * active library is unambiguous, anything else is a verdict the caller turns
 * into its own failure shape — a prompt, a usage error, or a deploy check.
 */
type MediaLibraryResolution =
  | {
      /** The active libraries a prompt would offer. */
      libraries: MediaLibrary[]
      message: string
      solution: string
      type: 'ambiguous'
    }
  | {mediaLibraryId: string; type: 'resolved'}
  | {message: string; solution: string; type: 'invalid-flag'}
  | {message: string; solution: string; type: 'none-active'}

/** @see MediaLibraryResolution */
async function resolveMediaLibrary(options: {
  mediaLibraryIdFlag: string | undefined
  organizationId: string
}): Promise<MediaLibraryResolution> {
  const {mediaLibraryIdFlag, organizationId} = options
  const libraries = await getMediaLibrariesForOrganization(organizationId)
  const libraryIds = libraries.map((library) => library.id)

  if (mediaLibraryIdFlag) {
    if (!libraryIds.includes(mediaLibraryIdFlag)) {
      return {
        message:
          `Media library ${mediaLibraryIdFlag} is not an active library of organization ` +
          `${organizationId} (found: ${libraryIds.join(', ') || 'none'})`,
        solution: 'Pass --media-library-id with one of the active library ids',
        type: 'invalid-flag',
      }
    }
    return {mediaLibraryId: mediaLibraryIdFlag, type: 'resolved'}
  }

  if (libraries.length === 0) {
    return {
      message: `Organization ${organizationId} has no active media library`,
      solution: 'Install the Media Library for the organization first',
      type: 'none-active',
    }
  }
  if (libraries.length > 1) {
    return {
      libraries,
      message:
        `Organization ${organizationId} has ${libraries.length} active media libraries ` +
        `(${libraryIds.join(', ')})`,
      solution: 'Pass --media-library-id with the library this config belongs to',
      type: 'ambiguous',
    }
  }
  return {mediaLibraryId: libraries[0].id, type: 'resolved'}
}

/**
 * Command-facing resolution: ambiguity prompts when interactive (Ctrl+C there
 * raises `ExitPromptError`, which callers must let propagate to
 * `SanityCommand.catch`); misuse — a bad flag value, a missing required flag
 * in unattended mode — exits with the usage code. No active library is an
 * environment problem, not misuse, so it keeps the runtime code.
 */
export async function resolveMediaLibraryId(options: {
  mediaLibraryIdFlag: string | undefined
  organizationId: string
  unattended: boolean
}): Promise<string> {
  const {mediaLibraryIdFlag, organizationId, unattended} = options
  const resolution = await resolveMediaLibrary({mediaLibraryIdFlag, organizationId})

  switch (resolution.type) {
    case 'ambiguous': {
      if (!unattended) return promptForMediaLibrary({mediaLibraries: resolution.libraries})
      throw new CLIError(`${resolution.message}. ${resolution.solution}.`, {
        exit: exitCodes.USAGE_ERROR,
      })
    }
    case 'invalid-flag': {
      throw new CLIError(`${resolution.message}. ${resolution.solution}.`, {
        exit: exitCodes.USAGE_ERROR,
      })
    }
    case 'none-active': {
      throw new CLIError(`${resolution.message}. ${resolution.solution}.`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
    default: {
      return resolution.mediaLibraryId
    }
  }
}
