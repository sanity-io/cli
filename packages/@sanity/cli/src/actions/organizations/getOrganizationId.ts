import {SanityOrgUser, subdebug} from '@sanity/cli-core'
import {select} from '@sanity/cli-core/ux'

import {promptForNewOrganization} from '../../prompts/promptForOrganization'
import {ProjectOrganization} from '../../services/organizations'
import {getOrganizationChoices} from './getOrganizationChoices'
import {getOrganizationsWithAttachGrantInfo} from './getOrganizationsWithAttachGrantInfo'

const debug = subdebug('getOrganizationId')

export async function getOrganizationId(organizations: ProjectOrganization[], user: SanityOrgUser) {
  // If the user has no organizations, prompt them to create one with the same name as
  // their user, but allow them to customize it if they want
  if (organizations.length === 0) {
    const newOrganization = await promptForNewOrganization(user)
    return newOrganization.id
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
    const newOrganization = await promptForNewOrganization(user)
    return newOrganization.id
  }

  return chosenOrg || undefined
}
