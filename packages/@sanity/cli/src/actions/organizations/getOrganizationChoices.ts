import {Separator} from '@sanity/cli-core/ux'

import {type OrganizationWithGrant} from '../../services/organizations.js'

export function getOrganizationChoices(withGrantInfo: OrganizationWithGrant[]): Array<
  | Separator
  | {
      disabled: boolean | string
      name: string
      value: string
    }
> {
  const choices = withGrantInfo.map(({hasAttachGrant, organization}) => ({
    disabled: hasAttachGrant ? false : 'Insufficient permissions',
    name: `${organization.name} [${organization.id}]`,
    value: organization.id,
  }))

  return [
    {disabled: false, name: 'Create new organization', value: '-new-'},
    ...(choices.length > 0 ? [new Separator(), ...choices] : []),
  ]
}
