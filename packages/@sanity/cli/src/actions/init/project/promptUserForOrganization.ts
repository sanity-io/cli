import {type SanityOrgUser, subdebug} from '@sanity/cli-core'
import {select} from '@sanity/cli-core/ux'

import {type ProjectOrganization} from '../../../services/organizations.js'
import {findOrganizationByUserName} from '../../organizations/findOrganizationByUserName.js'
import {getOrganizationChoices} from '../../organizations/getOrganizationChoices.js'
import {getOrganizationsWithAttachGrantInfo} from '../../organizations/getOrganizationsWithAttachGrantInfo.js'
import {type OrganizationChoices} from '../../organizations/types.js'
import {promptUserForNewOrganization} from './promptUserForNewOrganization.js'

const debug = subdebug('init')

export async function promptUserForOrganization({
  isAppTemplate = false,
  organizations,
  user,
}: {
  isAppTemplate?: boolean
  organizations: ProjectOrganization[]
  user: SanityOrgUser
}) {
  if (organizations.length === 0) {
    const newOrganization = await promptUserForNewOrganization(user)
    return newOrganization.id
  }

  let organizationChoices: OrganizationChoices
  let defaultOrganizationId: string | undefined

  if (isAppTemplate) {
    organizationChoices = getOrganizationChoices(organizations)
    defaultOrganizationId =
      organizations.length === 1
        ? organizations[0].id
        : findOrganizationByUserName(organizations, user)
  } else {
    debug(`User has ${organizations.length} organization(s), checking attach access`)
    const withGrantInfo = await getOrganizationsWithAttachGrantInfo(organizations)
    const withAttach = withGrantInfo.filter(({hasAttachGrant}) => hasAttachGrant)

    debug('User has attach access to %d organizations.', withAttach.length)
    organizationChoices = getOrganizationChoices(withGrantInfo)
    defaultOrganizationId =
      withAttach.length === 1
        ? withAttach[0].organization.id
        : findOrganizationByUserName(organizations, user)
  }

  const chosenOrg = await select({
    choices: organizationChoices,
    default: defaultOrganizationId || undefined,
    message: 'Select organization:',
  })

  if (chosenOrg === '-new-') {
    const newOrganization = await promptUserForNewOrganization(user)
    return newOrganization.id
  }

  return chosenOrg || undefined
}
