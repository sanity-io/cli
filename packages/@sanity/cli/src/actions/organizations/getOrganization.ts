import {Output, type SanityOrgUser, subdebug} from '@sanity/cli-core'
import {select, spinner} from '@sanity/cli-core/ux'

import {promptForOrganizationName} from '../../prompts/promptForOrganizationName.js'
import {
  createOrganization,
  listOrganizations,
  type ProjectOrganization,
} from '../../services/organizations.js'
import {getOrganizationChoices} from './getOrganizationChoices.js'
import {getOrganizationsWithAttachGrantInfo} from './getOrganizationsWithAttachGrantInfo.js'

const debug = subdebug('getOrganizationId')

const promptAndCreateNewOrganization = async (user: SanityOrgUser) => {
  const organizationName = await promptForOrganizationName(user)
  const spin = spinner('Creating organization').start()
  const newOrganization = await createOrganization(organizationName)
  spin.succeed()
  return newOrganization
}

export async function getOrganization(
  requestedId: string | undefined,
  user: SanityOrgUser,
  output: Output,
) {
  // Get available organizations
  const spin = spinner('Loading organizations').start()
  let organizations: ProjectOrganization[]
  try {
    organizations = await listOrganizations()
    spin.succeed()
  } catch (error) {
    spin.fail()
    debug('Error retrieving organization list', error)
    throw error
  }

  // If organization is specified, validate it
  if (requestedId) {
    const org = organizations.find((o) => o.id === requestedId || o.slug === requestedId)
    if (!org) {
      debug(`Organization "${requestedId}" not found or you don't have access to it`)
      throw new Error(`Organization "${requestedId}" not found or you don't have access to it`)
    }

    return org
  }

  // If the user has no organizations, prompt them to create one with the same name as
  // their user, but allow them to customize it if they want
  if (organizations.length === 0) {
    output.log('You need to create an organization to create projects.')
    return promptAndCreateNewOrganization(user)
  }

  // If the user has organizations, let them choose from them, but also allow them to
  // create a new one in case they do not have access to any of them, or they want to
  // create a personal/other organization.
  debug(`User has ${organizations.length} organization(s), checking attach access`)
  const withGrantInfo = await getOrganizationsWithAttachGrantInfo(organizations)
  const withAttach = withGrantInfo.filter(({hasAttachGrant}) => hasAttachGrant)

  debug('User has attach access to %d organizations.', withAttach.length)
  const organizationChoices = getOrganizationChoices(withAttach)

  // If the user only has a single organization (and they have attach access to it),
  // we'll default to that one. Otherwise, we'll default to the organization with the
  // same name as the user if it exists.
  const defaultOrganizationId =
    withAttach.length === 1
      ? withAttach[0].organization.id
      : organizations.find((org) => org.name === user?.name)?.id

  const chosenOrg = await select({
    choices: organizationChoices,
    default: defaultOrganizationId || undefined,
    message: 'Select organization:',
  })

  if (chosenOrg === '-new-') {
    return promptAndCreateNewOrganization(user)
  }

  return organizations.find((org) => org.id === chosenOrg)
}
