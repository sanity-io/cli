import {Output, type SanityOrgUser, subdebug} from '@sanity/cli-core'
import {select, spinner} from '@sanity/cli-core/ux'

import {promptForOrganizationName} from '../../prompts/promptForOrganizationName.js'
import {
  createOrganization,
  listOrganizations,
  type OrganizationRequestQuery,
  type ProjectOrganization,
} from '../../services/organizations.js'
import {findOrganizationByUserName} from './findOrganizationByUserName.js'
import {getOrganizationChoices} from './getOrganizationChoices.js'
import {getOrganizationsWithAttachGrantInfo} from './getOrganizationsWithAttachGrantInfo.js'

const debug = subdebug('getOrganizationId')

interface GetOrganizationOptions {
  isUnattended: boolean
  output: Output
  requestedId: string | undefined
  user: SanityOrgUser

  /**
   * Extra query params forwarded to the list-organizations API call.
   * Use when callers need `includeImplicitMemberships` or `includeMembers`.
   */
  listOrganizationsQuery?: OrganizationRequestQuery
  /**
   * When true, skips the attach-grant check and shows all organizations.
   * Used for app templates, which don't require project attachment permissions.
   */
  skipAttachCheck?: boolean
}

const promptAndCreateNewOrganization = async (user: SanityOrgUser) => {
  const organizationName = await promptForOrganizationName(user)
  const spin = spinner('Creating organization').start()
  const newOrganization = await createOrganization(organizationName)
  spin.succeed()
  return newOrganization
}

export async function getOrganization({
  isUnattended,
  listOrganizationsQuery,
  output,
  requestedId,
  skipAttachCheck = false,
  user,
}: GetOrganizationOptions) {
  // Get available organizations
  const spin = spinner('Loading organizations').start()
  let organizations: ProjectOrganization[]
  try {
    organizations = await listOrganizations(listOrganizationsQuery)
    spin.succeed()
  } catch (error) {
    spin.fail()
    debug('Error retrieving organization list', error)
    throw error
  }

  // If organization is specified, validate it
  if (requestedId) {
    const org = organizations.find((o) => o.id === requestedId || o.slug === requestedId)
    if (org) return org

    throw new Error(`Organization "${requestedId}" not found or you don't have access to it`)
  }

  // If the user has no organizations, prompt them to create one with the same name as
  // their user, but allow them to customize it if they want
  if (organizations.length === 0) {
    output.log('You need to create an organization to create projects.')
    return promptAndCreateNewOrganization(user)
  }

  // In unattended mode use defaults without prompting
  if (isUnattended) {
    if (skipAttachCheck) {
      return organizations[0]
    }
    const withGrantInfo = await getOrganizationsWithAttachGrantInfo(organizations)
    const withAttach = withGrantInfo.filter(({hasAttachGrant}) => hasAttachGrant)
    return withAttach.length > 0 ? withAttach[0].organization : undefined
  }

  // Interactive mode: build choices and prompt
  let organizationChoices
  let defaultOrganizationId: string | undefined

  if (skipAttachCheck) {
    // App templates: all organizations are valid — no attach grant check needed
    organizationChoices = getOrganizationChoices(organizations)
    defaultOrganizationId =
      organizations.length === 1
        ? organizations[0].id
        : findOrganizationByUserName(organizations, user)
  } else {
    // Studio projects: only show organizations the user can attach projects to
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
    return promptAndCreateNewOrganization(user)
  }

  return organizations.find((org) => org.id === chosenOrg)
}
