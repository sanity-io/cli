import {type OrganizationWithGrant} from '../../services/organizations.js'

export function getOrganizationChoices(withGrantInfo: OrganizationWithGrant[]): Array<{
  disabled: boolean | string
  name: string
  value: string
}> {
  const choices = withGrantInfo.map(({hasAttachGrant, organization}) => ({
    disabled: hasAttachGrant ? false : 'Insufficient permissions',
    name: `${organization.name} [${organization.id}]`,
    value: organization.id,
  }))

  choices.push(
    {disabled: true, name: '─────────', value: '---separator---'},
    {disabled: false, name: 'Create new organization', value: '-new-'},
    {disabled: true, name: '─────────', value: '---separator2---'},
  )

  return choices
}
