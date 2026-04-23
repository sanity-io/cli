import {type SanityOrgUser} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'

import {promptForOrganizationName} from '../../../prompts/promptForOrganizationName.js'
import {
  createOrganization,
  type OrganizationCreateResponse,
} from '../../../services/organizations.js'

export async function promptUserForNewOrganization(
  user: SanityOrgUser,
): Promise<OrganizationCreateResponse> {
  const name = await promptForOrganizationName(user)

  const spin = spinner('Creating organization').start()
  const organization = await createOrganization(name)
  spin.succeed()

  return organization
}
