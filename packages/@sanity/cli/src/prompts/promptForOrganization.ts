import {SanityOrgUser} from '@sanity/cli-core'
import {input, spinner} from '@sanity/cli-core/ux'

import {createOrganization, OrganizationCreateResponse} from '../services/organizations'
import {validateOrganizationName} from '../actions/organizations/validateOrganizationName'

export async function promptForNewOrganization(
  user: SanityOrgUser,
): Promise<OrganizationCreateResponse> {
  const name = await input({
    default: user ? user.name : undefined,
    message: 'Organization name:',
    validate: validateOrganizationName,
  })

  const spin = spinner('Creating organization').start()
  const organization = await createOrganization(name)
  spin.succeed()

  return organization
}
