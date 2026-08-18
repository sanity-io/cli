import {Flags} from '@oclif/core'
import {describe, expect, test} from 'vitest'

import {parseArguments} from '../parseArguments.js'
import {defineCommandTelemetry} from '../telemetry/commandTelemetry.js'

describe('parseArguments', () => {
  const flags = {
    dataset: Flags.string(),
    file: Flags.string(),
    format: Flags.string({
      aliases: ['output-format', 'p'],
      char: 'f',
      charAliases: ['o'],
    }),
    header: Flags.string({char: 'H', multiple: true}),
    token: Flags.string({char: 't'}),
  }

  const commandTelemetry = defineCommandTelemetry(flags, {
    redact: ['file', 'format', 'header', 'token'],
  })

  test('reads process argv by default', () => {
    const originalArgv = process.argv
    process.argv = ['node', 'sanity', 'documents', 'validate']

    try {
      expect(parseArguments().groupOrCommand).toBe('documents')
    } finally {
      process.argv = originalArgv
    }
  })

  test('preserves the full process argv contract', () => {
    const argv = ['/path/to/node', '/path/to/sanity', 'documents', 'validate']
    const result = parseArguments(argv)

    expect(result.argv).toBe(argv)
    expect(result.groupOrCommand).toBe('documents')
    expect(result.argsWithoutOptions).toEqual(['validate'])
  })

  test('preserves option telemetry by default', () => {
    const result = parseArguments([
      'node',
      'sanity',
      'documents',
      'validate',
      '--dataset=production',
      '--file=/Users/jane/private.ndjson',
      '-tsecret-token',
    ])

    expect(result.extraArguments).toEqual([
      '--dataset=production',
      '--file=/Users/jane/private.ndjson',
      '-tsecret-token',
    ])
  })

  test('redacts declared inline and concatenated option values', () => {
    const result = parseArguments(
      [
        'node',
        'sanity',
        'documents',
        'validate',
        '--file=/Users/jane/private.ndjson',
        '--header=Authorization: Bearer secret-token',
        '-tsecret-token',
      ],
      commandTelemetry,
    )

    expect(result.extraArguments).toEqual(['--file', '--header', '--token'])
    expect(result.extraArguments.join(' ')).not.toContain('jane')
    expect(result.extraArguments.join(' ')).not.toContain('secret-token')
  })

  test('uses the canonical name when redacting aliases', () => {
    const result = parseArguments(
      [
        'node',
        'sanity',
        'documents',
        'validate',
        '--output-format=private-format',
        '-fprivate-format',
        '-oprivate-format',
        '-pprivate-format',
      ],
      commandTelemetry,
    )

    expect(result.extraArguments).toEqual(['--format', '--format', '--format', '--format'])
  })

  test('redacts the canonical syntax when the flag definition is missing', () => {
    const result = parseArguments(
      ['node', 'sanity', 'documents', 'validate', '--missing=private-value'],
      defineCommandTelemetry(flags as Record<string, (typeof flags)[keyof typeof flags]>, {
        redact: ['missing'],
      }),
    )

    expect(result.extraArguments).toEqual(['--missing'])
  })

  test('does not match long options against short flag syntax', () => {
    const result = parseArguments(
      ['node', 'sanity', 'documents', 'validate', '--file=public', '--tokenize=public'],
      defineCommandTelemetry(flags, {redact: ['format', 'token']}),
    )

    expect(result.extraArguments).toEqual(['--file=public', '--tokenize=public'])
  })

  test('keeps the existing name-only telemetry for spaced option values', () => {
    const result = parseArguments(
      ['node', 'sanity', 'documents', 'validate', '--file', 'private.ndjson', '-t', 'secret'],
      commandTelemetry,
    )

    expect(result.extraArguments).toEqual(['--file', '--token'])
  })

  test('preserves forwarded argument telemetry', () => {
    const result = parseArguments(
      ['node', 'sanity', 'exec', 'script.ts', '--', '--token=forwarded-secret'],
      commandTelemetry,
    )

    expect(result.extraArguments).toEqual([
      '--token=forwarded-secret',
      '--',
      '--token=forwarded-secret',
    ])
  })

  test('detects help from full process argv', () => {
    const result = parseArguments(['/path/to/node', '/path/to/sanity', 'help', 'dataset'])

    expect(result.coreOptions.help).toBe(true)
  })
})
