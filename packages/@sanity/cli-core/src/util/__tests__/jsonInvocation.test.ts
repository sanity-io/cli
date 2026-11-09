import {Flags, Parser} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {describe, expect, test} from 'vitest'

import {hasJsonFlagInArgv, toRelayableErrorJson} from '../jsonInvocation.js'

const definitions = {
  json: Flags.boolean({char: 'j'}),
  name: Flags.string({char: 'n'}),
  yes: Flags.boolean({char: 'y'}),
}

describe('hasJsonFlagInArgv', () => {
  test.each([
    {argv: ['--json'], expected: true},
    {argv: ['-j'], expected: true},
    {argv: ['-yj'], expected: true},
    {argv: ['-jy'], expected: true},
    {argv: ['--json=true'], expected: true},
    // oclif drops the `=` part for a boolean, so this still parses as JSON mode
    {argv: ['--json=false'], expected: true},
    {argv: ['--name=x', '-j'], expected: true},
    {argv: ['--name=--json'], expected: false},
    {argv: ['-n', 'x', '-j'], expected: true},
    {argv: ['--name', '-j'], expected: false},
    {argv: ['-nj'], expected: false},
    {argv: ['--', '-j'], expected: false},
    {argv: ['--', '--json'], expected: false},
    {argv: ['--name', 'json'], expected: false},
    {argv: [], expected: false},
  ])('resolves $argv to $expected', ({argv, expected}) => {
    expect(hasJsonFlagInArgv(argv, definitions)).toBe(expected)
  })

  test.each(['--json=true', '--json=false'])('agrees with oclif on %s', async (argument) => {
    // The equals form only reaches `run()` on a non-strict command; a strict
    // one rejects the leftover value. Either way the scan has to match what
    // the parser concluded, so that a failure during parsing formats the same
    // way as one after it.
    const parsed = await Parser.parse([argument], {flags: definitions, strict: false})

    expect(parsed.flags.json).toBe(true)
    expect(hasJsonFlagInArgv([argument], definitions)).toBe(true)
  })

  test('recognizes the long form without a declared short alias', () => {
    // `enableJsonFlag` adds `--json` without a `char`, so the long form has to
    // be recognized from argv alone for commands that declare no json flag.
    expect(hasJsonFlagInArgv(['--json'], {})).toBe(true)
    expect(hasJsonFlagInArgv(['-j'], {})).toBe(false)
  })
})

describe('toRelayableErrorJson', () => {
  test('keeps the properties a caller can act on', () => {
    const err = Object.assign(new CLIError('Nope', {exit: 2}), {
      code: 'E_NOPE',
      suggestions: ['Try --help'],
    })

    expect(toRelayableErrorJson(err)).toEqual({
      error: {
        code: 'E_NOPE',
        message: 'Nope',
        name: 'Error',
        oclif: {exit: 2},
        suggestions: ['Try --help'],
      },
    })
  })

  test('drops parser context and HTTP responses', () => {
    const err = Object.assign(new Error('Nonexistent flag: --nope'), {
      parse: {input: {context: {config: {commands: Array.from({length: 500}, () => '…')}}}},
      response: {body: {secret: 'leak'}, headers: {authorization: 'Bearer x'}},
      responseBody: 'x'.repeat(10_000),
    })

    const relayed = toRelayableErrorJson(err)

    expect(relayed).toEqual({error: {message: 'Nonexistent flag: --nope', name: 'Error'}})
    expect(JSON.stringify(relayed)).not.toContain('Bearer')
  })

  test('passes a non-error through unchanged', () => {
    expect(toRelayableErrorJson('boom')).toEqual({error: 'boom'})
  })
})
