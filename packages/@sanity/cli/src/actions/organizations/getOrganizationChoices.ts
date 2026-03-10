import {Separator} from '@sanity/cli-core/ux'

import {type OrganizationWithGrant, type ProjectOrganization} from '../../services/organizations.js'
import {type OrganizationChoices} from './types.js'

function isOrganizationWithGrant(
  org: OrganizationWithGrant | ProjectOrganization,
): org is OrganizationWithGrant {
  return 'hasAttachGrant' in org
}

export function getOrganizationChoices(organizations: ProjectOrganization[]): OrganizationChoices
export function getOrganizationChoices(organizations: OrganizationWithGrant[]): OrganizationChoices
export function getOrganizationChoices(
  organizations: OrganizationWithGrant[] | ProjectOrganization[],
): OrganizationChoices {
  const choices = organizations.map((org) => {
    if (isOrganizationWithGrant(org)) {
      return {
        disabled: org.hasAttachGrant ? false : 'Insufficient permissions',
        name: `${org.organization.name} [${org.organization.id}]`,
        value: org.organization.id,
      }
    }
    return {name: `${org.name} [${org.id}]`, value: org.id}
  })

  return [
    {name: 'Create new organization', value: '-new-'},
    ...(choices.length > 0 ? [new Separator(), ...choices] : []),
  ]
}
