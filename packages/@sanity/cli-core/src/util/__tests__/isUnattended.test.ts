import {describe, expect, test} from 'vitest'

import {isUnattended, isUnattendedInvocation} from '../isUnattended.js'

describe('isUnattended', () => {
  test.each([
    {expected: false, isInteractive: true},
    {expected: true, isInteractive: true, yes: true},
    {expected: true, isInteractive: true, json: true},
    {expected: true, isInteractive: false},
  ])('returns $expected for $isInteractive, $yes, $json', ({expected, ...options}) => {
    expect(isUnattended(options)).toBe(expected)
  })
})

describe('isUnattendedInvocation', () => {
  test.each([
    {argv: [], expected: false, isInteractive: true},
    {argv: ['--yes'], expected: true, isInteractive: true},
    {argv: ['-y'], expected: true, isInteractive: true},
    {argv: ['--json'], expected: true, isInteractive: true},
    {argv: [], expected: true, isInteractive: false},
    {argv: ['--', '--yes'], expected: false, isInteractive: true},
  ])('returns $expected for $argv', ({argv, expected, isInteractive}) => {
    expect(isUnattendedInvocation({argv, isInteractive})).toBe(expected)
  })
})
