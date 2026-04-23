import {type SanityOrgUser} from '@sanity/cli-core'
import {input, select, spinner} from '@sanity/cli-core/ux'

import {findOrganizationByUserName} from '../actions/organizations/findOrganizationByUserName.js'
import {getOrganizationChoices} from '../actions/organizations/getOrganizationChoices.js'
import {validateOrganizationName} from '../actions/organizations/validateOrganizationName.js'
import {
  createOrganization,
  type OrganizationCreateResponse,
  type OrganizationWithGrant,
  type ProjectOrganization,
} from '../services/organizations.js'

interface PromptForOrganizationOptions {
  organizations: OrganizationWithGrant[]
  user: SanityOrgUser
}

async function promptAndCreateOrganization(
  user: SanityOrgUser,
): Promise<OrganizationCreateResponse> {
  const organizationName = await input({
    default: user?.name,
    message: 'Organization name:',
    validate: validateOrganizationName,
  })
  const spin = spinner('Creating organization').start()
  const newOrganization = await createOrganization(organizationName)
  spin.succeed()
  return newOrganization
}

export async function promptForOrganization({
  organizations,
  user,
}: PromptForOrganizationOptions): Promise<
  OrganizationCreateResponse | ProjectOrganization | undefined
> {
  const withAttach = organizations.filter(({hasAttachGrant}) => hasAttachGrant)
  const choices = getOrganizationChoices(organizations)

  const defaultOrganizationId =
    withAttach.length === 1
      ? withAttach[0].organization.id
      : findOrganizationByUserName(
          organizations.map((o) => o.organization),
          user,
        )

  const chosenOrg = await select({
    choices,
    default: defaultOrganizationId || undefined,
    message: 'Select organization:',
  })

  if (chosenOrg === '-new-') {
    return promptAndCreateOrganization(user)
  }

  return organizations.find((o) => o.organization.id === chosenOrg)?.organization
}

export async function promptForNewOrganization(
  user: SanityOrgUser,
): Promise<OrganizationCreateResponse> {
  return promptAndCreateOrganization(user)
}
