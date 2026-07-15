import {describe, expect, test} from 'vitest'

import {validateOrganizationSlug} from '../validateOrganizationSlug.js'

describe('validateOrganizationSlug', () => {
  test.each([['acme'], ['acme-corp'], ['my-org-123'], ['a'], ['abc123']])(
    'returns true for valid slug: "%s"',
    (slug) => {
      expect(validateOrganizationSlug(slug)).toBe(true)
    },
  )

  test.each([
    ['', 'Organization slug cannot be empty'],
    ['   ', 'Organization slug cannot be empty'],
  ])('returns error for empty or whitespace: "%s"', (slug, expected) => {
    expect(validateOrganizationSlug(slug)).toBe(expected)
  })

  test.each([
    ['Acme', 'Organization slug must be lowercase'],
    ['ACME', 'Organization slug must be lowercase'],
  ])('returns error for uppercase: "%s"', (slug, expected) => {
    expect(validateOrganizationSlug(slug)).toBe(expected)
  })

  test.each([
    ['acme corp', 'Organization slug cannot contain spaces'],
    ['acme\tcorp', 'Organization slug cannot contain spaces'],
  ])('returns error for spaces: "%s"', (slug, expected) => {
    expect(validateOrganizationSlug(slug)).toBe(expected)
  })

  test.each([
    ['my_org', 'Organization slug may only contain lowercase letters, numbers, and dashes'],
    ['acme!', 'Organization slug may only contain lowercase letters, numbers, and dashes'],
    ['acmé', 'Organization slug may only contain lowercase letters, numbers, and dashes'],
  ])('returns error for invalid characters: "%s"', (slug, expected) => {
    expect(validateOrganizationSlug(slug)).toBe(expected)
  })

  test.each([
    ['-acme', 'Organization slug cannot start or end with a dash'],
    ['acme-', 'Organization slug cannot start or end with a dash'],
  ])('returns error for leading or trailing dash: "%s"', (slug, expected) => {
    expect(validateOrganizationSlug(slug)).toBe(expected)
  })
})
