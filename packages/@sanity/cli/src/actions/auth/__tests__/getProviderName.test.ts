import {type SanityOrgUser} from '@sanity/cli-core'
import {describe, expect, test} from 'vitest'

import {getProviderName, getUserDisplayName} from '../getProviderName.js'

function createUser(overrides: Partial<SanityOrgUser> = {}): SanityOrgUser {
  return {
    email: 'someone@example.com',
    id: 'abc123',
    name: 'Someone',
    provider: 'sanity',
    ...overrides,
  }
}

describe('getProviderName', () => {
  test.each([
    ['google', 'Google'],
    ['github', 'GitHub'],
    ['sanity', 'Email'],
    ['saml-acme', 'SAML'],
  ])('maps %s to %s', (provider, expected) => {
    expect(getProviderName(provider)).toBe(expected)
  })

  test('reads as prose for API tokens, rather than "Sanity-token"', () => {
    expect(getProviderName('sanity-token')).toBe('an API token')
  })

  test('title-cases unknown providers', () => {
    expect(getProviderName('somenewprovider')).toBe('Somenewprovider')
  })
})

describe('getUserDisplayName', () => {
  test('prefers the email', () => {
    expect(getUserDisplayName(createUser())).toBe('someone@example.com')
  })

  // API tokens resolve to a user with a null email — the reason this helper exists.
  test('falls back to the name when the email is null', () => {
    expect(
      getUserDisplayName(
        createUser({email: null, name: 'CI Robot (Robot)', provider: 'sanity-token'}),
      ),
    ).toBe('CI Robot (Robot)')
  })

  test('falls back to the id when neither email nor name is usable', () => {
    expect(getUserDisplayName(createUser({email: null, name: ''}))).toBe('abc123')
  })

  test('never renders a literal "null"', () => {
    expect(getUserDisplayName(createUser({email: null}))).not.toMatch(/null/)
  })
})
