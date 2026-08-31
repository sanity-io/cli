import {promptForOrganization} from '../../prompts/promptForOrganization.js'

/** The organization could not be determined and prompting is not possible. */
export class MissingOrganizationError extends Error {}

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

  if (flagOrganizationId) return flagOrganizationId
  if (configuredOrganizationId) return configuredOrganizationId

  if (unattended) {
    throw new MissingOrganizationError(
      'Organization ID is required. Provide it with the --organization flag.',
    )
  }

  return promptForOrganization()
}
