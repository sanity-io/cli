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
    {argv: ['-yf'], expected: true, isInteractive: true},
    {argv: ['-py'], expected: false, isInteractive: true},
    {argv: ['--json'], expected: true, isInteractive: true},
    {argv: ['--yes=true'], expected: false, isInteractive: true},
    {argv: ['--json=true'], expected: false, isInteractive: true},
    {argv: [], expected: true, isInteractive: false},
    {argv: ['--', '--yes'], expected: false, isInteractive: true},
    {argv: ['--', '-yf'], expected: false, isInteractive: true},

    // We don't have access to the flag metadata for the command being run
    // A preceding short option might consume the trailing `y` as its value, so we can't reliably detect unattended mode in those cases
    {argv: ['-fy'], expected: false, isInteractive: true},
  ])('returns $expected for $argv', ({argv, expected, isInteractive}) => {
    expect(isUnattendedInvocation({argv, isInteractive})).toBe(expected)
  })
})
