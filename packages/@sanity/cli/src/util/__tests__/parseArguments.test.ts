import {Flags} from '@oclif/core'
import {describe, expect, test} from 'vitest'

import {parseArguments, parseCommandArguments} from '../parseArguments.js'
import {defineCommandTelemetry, telemetry} from '../telemetry/commandTelemetry.js'

describe('parseArguments', () => {
  const flags = {
    dataset: Flags.string(),
    format: Flags.string({
      aliases: ['output-format'],
      char: 'f',
    }),
    header: Flags.string({multiple: true}),
    mcp: Flags.boolean({allowNo: true}),
    token: Flags.string({char: 't'}),
    type: Flags.string(),
  }

  const commandTelemetry = defineCommandTelemetry(flags, {
    flags: {
      format: telemetry.enum(['json', 'ndjson', 'pretty']),
    },
  })

  test('preserves the full process argv contract', async () => {
    const result = await parseArguments(
      ['/path/to/node', '/path/to/sanity', '--dataset=production'],
      flags,
    )

    expect(result.argv).toEqual(['--dataset=production'])
    expect(result.extraArguments).toEqual(['--dataset'])
  })

  test('detects help from full process argv', async () => {
    const result = await parseArguments(['/path/to/node', '/path/to/sanity', 'help', 'dataset'])

    expect(result.coreOptions.help).toBe(true)
  })

  test('uses resolved command metadata for help with command-scoped argv', async () => {
    const positionalHelp = await parseCommandArguments(['help'])
    const helpCommand = await parseCommandArguments(['dataset'], {}, {}, {isHelpCommand: true})

    expect(positionalHelp.coreOptions.help).toBe(false)
    expect(helpCommand.coreOptions.help).toBe(true)
  })

  test('records option names without user-supplied values', async () => {
    const result = await parseCommandArguments(
      [
        'private.ndjson',
        '--token=secret-token',
        '--dataset',
        'production',
        '--type=image',
        '--header=Authorization: Bearer secret-token',
      ],
      flags,
    )

    expect(result.extraArguments).toEqual(['--token', '--dataset', '--type', '--header'])
    expect(result.extraArguments.join(' ')).not.toContain('secret-token')
    expect(result.extraArguments.join(' ')).not.toContain('image')
  })

  test('records registered flags alongside additional positional arguments', async () => {
    const result = await parseCommandArguments(
      ['script.ts', 'additional.ts', '--token=secret-token'],
      flags,
      commandTelemetry,
    )

    expect(result.extraArguments).toEqual(['--token'])
  })

  test('rejects unregistered flags while allowing additional positional arguments', async () => {
    await expect(
      parseCommandArguments(['script.ts', 'additional.ts', '--api-key=secret-key'], flags),
    ).rejects.toThrow('Nonexistent flag: --api-key')
  })

  test('uses command flag registration to normalize concatenated short options', async () => {
    const result = await parseCommandArguments(['-tsecret-token'], flags)

    expect(result.extraArguments).toEqual(['--token'])
  })

  test('records boolean presence using the canonical flag name', async () => {
    const result = await parseCommandArguments(['--mcp', '--no-mcp'], flags)

    expect(result.extraArguments).toEqual(['--mcp', '--mcp'])
  })

  test('retains declared enum values across spaced and inline forms', async () => {
    const result = await parseCommandArguments(
      ['--format', 'json', '--format=pretty'],
      flags,
      commandTelemetry,
    )

    expect(result.extraArguments).toEqual(['--format=json', '--format=pretty'])
  })

  test('uses the canonical flag name for declared aliases', async () => {
    const result = await parseCommandArguments(
      ['--output-format=json', '-f', 'ndjson'],
      flags,
      commandTelemetry,
    )

    expect(result.extraArguments).toEqual(['--format=json', '--format=ndjson'])
  })

  test('redacts values outside a declared enum', async () => {
    const result = await parseCommandArguments(['--format=private-format'], flags, commandTelemetry)

    expect(result.extraArguments).toEqual(['--format'])
  })

  test('does not record arguments forwarded after the argument separator', async () => {
    const result = await parseCommandArguments(
      ['script.ts', '--', '--format=json', '--api-key=secret-key', 'private-value'],
      flags,
      commandTelemetry,
    )

    expect(result.extraArguments).toEqual([])
  })
})
