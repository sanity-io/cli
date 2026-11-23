import {CLIError} from '@oclif/core/errors'
import {exitCodes} from '@sanity/cli-core'
import {isBlueprintMode} from '@sanity/cli-core/config'

import {promptForOrganization} from '../../prompts/promptForOrganization.js'

/** The organization could not be determined and prompting is not possible. */
export class MissingOrganizationError extends CLIError {
  constructor(message: string) {
    super(message, {exit: exitCodes.USAGE_ERROR})
  }
}

/**
 * Resolve the organization to operate on: the `--organization` flag wins,
 * then the CLI config's `app.organizationId`, then an interactive prompt.
 */
export async function resolveOrganizationId(options: {
  configuredOrganizationId: string | undefined
  flagOrganizationId: string | undefined
  unattended: boolean
}): Promise<string> {
  const {configuredOrganizationId, flagOrganizationId, unattended} = options

  const organizationId = flagOrganizationId || configuredOrganizationId
  if (organizationId) return organizationId

  if (isBlueprintMode()) {
    throw new MissingOrganizationError(
      'Organization ID is required in Blueprint mode. Pass `--organization`, set SANITY_ORGANIZATION_ID, or select a profile with an organization.',
    )
  }
  if (unattended) {
    throw new MissingOrganizationError(
      'Organization ID is required. Provide it with the --organization flag.',
    )
  }

  return promptForOrganization()
}
