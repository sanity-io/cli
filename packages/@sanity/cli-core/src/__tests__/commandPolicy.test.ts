import {describe, expect, test} from 'vitest'

import {
  allow,
  type CommandPolicy,
  conditionalDenyFlags,
  conditionalPolicy,
  deny,
  isCommandPolicySet,
  isConditionalInvocationPolicy,
} from '../commandPolicy.js'

/**
 * These two functions guard the boundary with plugin-authored policy modules,
 * which are third-party code imported at runtime. A table that gets past
 * `isCommandPolicySet` is later narrowed by `isConditionalInvocationPolicy`
 * and read for `deniedFlags`, so the validator has to reject anything the
 * narrowed type would lie about.
 */
describe('isCommandPolicySet', () => {
  test('accepts the policies the exported helpers build', () => {
    expect(
      isCommandPolicySet({
        'widgets:deploy': conditionalDenyFlags('source-maps'),
        'widgets:list': allow,
        'widgets:push': deny,
        'widgets:test': conditionalPolicy({
          deniedFlags: ['watch'],
          validate: ({args}) => args.name !== 'secret',
        }),
      }),
    ).toBe(true)
  })

  test('accepts a hand-authored table that matches the contract', () => {
    expect(
      isCommandPolicySet({
        'widgets:list': {kind: 'allow', validate: () => true},
        'widgets:sync': {deniedFlags: [], kind: 'conditional', validate: () => true},
      }),
    ).toBe(true)
  })

  test('rejects a conditional entry with no deniedFlags', () => {
    // Type-valid against `CommandPolicy`, but the help renderer and the
    // refusal message both read `deniedFlags`. Refusing here keeps those
    // paths from throwing on a declaration a plugin controls.
    expect(
      isCommandPolicySet({
        'widgets:sync': {kind: 'conditional', validate: () => true},
      }),
    ).toBe(false)
  })

  test('rejects a conditional entry whose deniedFlags are not strings', () => {
    expect(
      isCommandPolicySet({
        'widgets:sync': {deniedFlags: [{}, 7], kind: 'conditional', validate: () => true},
      }),
    ).toBe(false)
  })

  test('rejects an entry with no validate function', () => {
    expect(isCommandPolicySet({'widgets:list': {kind: 'allow'}})).toBe(false)
  })

  test('rejects an unrecognized kind', () => {
    expect(isCommandPolicySet({'widgets:list': {kind: 'maybe', validate: () => true}})).toBe(false)
  })

  test('rejects values that are not tables of objects', () => {
    expect(isCommandPolicySet(null)).toBe(false)
    expect(isCommandPolicySet('allow')).toBe(false)
    expect(isCommandPolicySet({'widgets:list': null})).toBe(false)
  })
})

describe('isConditionalInvocationPolicy', () => {
  test('narrows a policy that carries deniedFlags', () => {
    const policy = conditionalDenyFlags('source-maps')

    expect(isConditionalInvocationPolicy(policy)).toBe(true)
  })

  test('refuses a policy that claims `conditional` without deniedFlags', () => {
    // Guards the same shape from the other side: callers read `deniedFlags`
    // off the narrowed type, so claiming the kind alone must not be enough.
    const policy = {kind: 'conditional', validate: () => true}

    expect(isConditionalInvocationPolicy(policy as CommandPolicy)).toBe(false)
  })

  test('refuses unconditional policies', () => {
    expect(isConditionalInvocationPolicy(allow)).toBe(false)
    expect(isConditionalInvocationPolicy(deny)).toBe(false)
  })
})
