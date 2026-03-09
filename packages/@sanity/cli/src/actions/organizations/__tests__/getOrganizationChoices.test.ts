import {Separator} from '@sanity/cli-core/ux'
import {describe, expect, test} from 'vitest'

import {getOrganizationChoices} from '../getOrganizationChoices.js'

describe('getOrganizationChoices', () => {
  test('always includes "Create new organization" as the first item', () => {
    const result = getOrganizationChoices([])
    expect(result[0]).toEqual({disabled: false, name: 'Create new organization', value: '-new-'})
  })

  test('returns only "Create new organization" when given an empty list', () => {
    const result = getOrganizationChoices([])
    expect(result).toHaveLength(1)
  })

  test('includes a separator between "Create new organization" and org choices', () => {
    const result = getOrganizationChoices([
      {hasAttachGrant: true, organization: {id: 'org-1', name: 'Org One', slug: 'org-one'}},
    ])

    expect(result[1]).toBeInstanceOf(Separator)
  })

  test('formats org name as "Name [id]"', () => {
    const result = getOrganizationChoices([
      {hasAttachGrant: true, organization: {id: 'org-1', name: 'Org One', slug: 'org-one'}},
    ])

    expect(result[2]).toMatchObject({name: 'Org One [org-1]', value: 'org-1'})
  })

  test('sets disabled option to false for orgs with attach grant', () => {
    const result = getOrganizationChoices([
      {hasAttachGrant: true, organization: {id: 'org-1', name: 'Org One', slug: 'org-one'}},
    ])

    expect(result[2]).toMatchObject({disabled: false})
  })

  test('sets disabled to "Insufficient permissions" for orgs without attach grant', () => {
    const result = getOrganizationChoices([
      {hasAttachGrant: false, organization: {id: 'org-1', name: 'Org One', slug: 'org-one'}},
    ])

    expect(result[2]).toMatchObject({disabled: 'Insufficient permissions'})
  })
})
