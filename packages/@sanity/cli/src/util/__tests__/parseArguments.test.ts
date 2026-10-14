import {Flags} from '@oclif/core'
import {describe, expect, test} from 'vitest'

import {parseArguments} from '../parseArguments.js'
import {defineCommandTelemetry} from '../telemetry/commandTelemetry.js'

const flags = {
  dataset: Flags.string(),
  file: Flags.string(),
  format: Flags.string({aliases: ['output-format', 'p'], char: 'f', charAliases: ['o']}),
  header: Flags.string({char: 'H', multiple: true}),
  quiet: Flags.boolean({char: 'q'}),
  token: Flags.string({aliases: ['auth-token'], char: 't'}),
  watch: Flags.boolean({allowNo: true}),
}
const command = {
  flags,
  id: 'documents:validate',
  telemetry: defineCommandTelemetry(flags, {redact: ['file', 'header', 'token']}),
}
const parse = (args: string[]) => parseArguments(['node', 'sanity', ...args], command)

describe('parseArguments', () => {
  test('uses resolved command identity instead of positional input', () => {
    const result = parse(['document', 'validate', '/Users/jane/private.ndjson'])
    expect(result.groupOrCommand).toBe('documents')
    expect(result.argsWithoutOptions).toEqual(['validate'])
    expect(JSON.stringify(result)).not.toContain('jane')
  })

  test('fails closed without a resolved command', () => {
    const result = parseArguments(['node', 'sanity', 'secret', '--token=secret'])
    expect(result.groupOrCommand).toBe('unknown')
    expect(result.argsWithoutOptions).toEqual([])
    expect(result.extraArguments).toEqual([])
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  test('preserves non-sensitive inline values', () => {
    expect(
      parse(['documents', 'validate', '--dataset=production', '--format=json']).extraArguments,
    ).toEqual(['--dataset=production', '--format=json'])
  })

  test.each([
    ['--token=private-secret'],
    ['--token', 'private-secret'],
    ['-tprivate-secret'],
    ['-t=private-secret'],
    ['-t', 'private-secret'],
    ['--auth-token=private-secret'],
    ['-qtprivate-secret'],
    ['--token', '--format=private-secret'],
    ['--token', '-private-secret'],
  ])('redacts option syntax %j', (...args) => {
    const result = parse(args)
    expect(JSON.stringify(result)).not.toContain('private-secret')
    expect(result.extraArguments).toContain('--token')
  })

  test('handles repeated headers and consumes dash-leading values', () => {
    expect(
      parse(['-HAuthorization: Bearer private', '--header=-private', '-H', '--format=private'])
        .extraArguments,
    ).toEqual(['--header', '--header', '--header'])
  })

  test('does not collect script arguments after the separator', () => {
    expect(
      parse(['--format=json', '--', '--token=private', '--format=private', 'private'])
        .extraArguments,
    ).toEqual(['--format=json'])
  })

  test('does not reinterpret an unknown flag or its value', () => {
    expect(parse(['--dataset=production', '--unknown', '--format=private']).extraArguments).toEqual(
      ['--dataset=production'],
    )
    expect(parse(['-xftprivate']).extraArguments).toEqual([])
  })

  test('handles short boolean groups without exposing an attached option value', () => {
    expect(parse(['-qqtprivate']).extraArguments).toEqual(['--quiet', '--quiet', '--token'])
  })

  test('does not match long options against a short flag prefix', () => {
    expect(parse(['--tokenize=private']).extraArguments).toEqual([])
  })

  test('recognizes non-sensitive aliases and boolean negation', () => {
    expect(
      parse(['--output-format=json', '-ojson', '-pjson', '--no-watch']).extraArguments,
    ).toEqual(['--output-format=json', '-ojson', '-pjson', '--no-watch'])
  })

  test('does not log an invalid value attached to a boolean', () => {
    expect(parse(['--quiet=private']).extraArguments).toEqual(['--quiet'])
  })

  test('does not retain query literals, emails, URL signatures or local paths', () => {
    for (const value of [
      '*[_type == "private"]',
      'private@example.test',
      'https://example.test/?sig=private',
      '/Users/private/file',
    ]) {
      expect(JSON.stringify(parse(['documents', 'validate', value]))).not.toContain('private')
    }
  })

  test('does not mutate command input', () => {
    const args = ['node', 'sanity', 'documents', 'validate', '--token=private', '--', 'private']
    const original = [...args]
    parseArguments(args, command)
    expect(args).toEqual(original)
  })

  test('uses command identity for help and version', () => {
    expect(parseArguments([], {id: 'help'}).coreOptions.help).toBe(true)
    expect(parseArguments([], {id: 'version'}).coreOptions.version).toBe(true)
    expect(parse(['help', '--file=version']).coreOptions.help).toBe(false)
  })
})
