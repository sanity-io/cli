import {describe, expect, test} from 'vitest'

import {validateOrganizationName} from '../validateOrganizationName.js'

describe('validateOrganizationName', () => {
  test.each([
    ['My Organization'],
    ['A'],
    ['Org-Name'],
    ['🚀 Organization'],
    ['組織'],
    ['a'.repeat(100)], // Exactly 100 characters (max)
  ])('returns true for valid organization name: "%s"', (organizationName) => {
    expect(validateOrganizationName(organizationName)).toBe(true)
  })

  test.each([
    ['', 'Organization name cannot be empty'],
    ['   ', 'Organization name cannot be empty'],
    ['\t\n  ', 'Organization name cannot be empty'],
  ])('returns error for empty or whitespace: "%s"', (organizationName, expected) => {
    expect(validateOrganizationName(organizationName)).toBe(expected)
  })

  test('returns error for names longer than 100 characters', () => {
    expect(validateOrganizationName('a'.repeat(101))).toBe(
      'Organization name cannot be longer than 100 characters',
    )
  })
})
