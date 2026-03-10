import {describe, expect, test} from 'vitest'

import {getDatasetFlag, getProjectIdFlag} from '../sharedFlags.js'

describe('getProjectIdFlag', () => {
  test('override semantics: appends suffix and sets OVERRIDE helpGroup', () => {
    const flags = getProjectIdFlag({description: 'Project ID to query', semantics: 'override'})
    const flag = flags['project-id']
    expect(flag.description).toBe('Project ID to query (overrides CLI configuration)')
    expect(flag.helpGroup).toBe('OVERRIDE')
  })

  test('override semantics: uses default description when none provided', () => {
    const flags = getProjectIdFlag({semantics: 'override'})
    const flag = flags['project-id']
    expect(flag.description).toBe('Project ID to use (overrides CLI configuration)')
    expect(flag.helpGroup).toBe('OVERRIDE')
  })

  test('override semantics: allows helpGroup override', () => {
    const flags = getProjectIdFlag({helpGroup: 'CUSTOM', semantics: 'override'})
    const flag = flags['project-id']
    expect(flag.description).toContain('(overrides CLI configuration)')
    expect(flag.helpGroup).toBe('CUSTOM')
  })

  test('specify semantics: no suffix, no helpGroup', () => {
    const flags = getProjectIdFlag({description: 'Project ID to import to', semantics: 'specify'})
    const flag = flags['project-id']
    expect(flag.description).toBe('Project ID to import to')
    expect(flag.helpGroup).toBeUndefined()
  })

  test('specify semantics: uses default description when none provided', () => {
    const flags = getProjectIdFlag({semantics: 'specify'})
    const flag = flags['project-id']
    expect(flag.description).toBe('Project ID to use')
    expect(flag.helpGroup).toBeUndefined()
  })

  test('specify semantics: allows helpGroup override', () => {
    const flags = getProjectIdFlag({helpGroup: 'CUSTOM', semantics: 'specify'})
    const flag = flags['project-id']
    expect(flag.description).not.toContain('(overrides CLI configuration)')
    expect(flag.helpGroup).toBe('CUSTOM')
  })

  test('char is always p', () => {
    const flags = getProjectIdFlag({semantics: 'override'})
    expect(flags['project-id'].char).toBe('p')
  })

  test('parse trims and validates non-empty', async () => {
    const flags = getProjectIdFlag({semantics: 'override'})
    const parse = flags['project-id'].parse!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing parse in isolation, context/opts not used
    const invoke = (input: string) => parse(input, {} as any, {} as any)
    await expect(invoke('  abc  ')).resolves.toBe('abc')
    await expect(invoke('  ')).rejects.toThrow('cannot be empty')
  })
})

describe('getDatasetFlag', () => {
  test('override semantics: appends suffix and sets OVERRIDE helpGroup', () => {
    const flags = getDatasetFlag({description: 'Dataset to query', semantics: 'override'})
    const flag = flags.dataset
    expect(flag.description).toBe('Dataset to query (overrides CLI configuration)')
    expect(flag.helpGroup).toBe('OVERRIDE')
  })

  test('specify semantics: no suffix, no helpGroup', () => {
    const flags = getDatasetFlag({description: 'Dataset to import to', semantics: 'specify'})
    const flag = flags.dataset
    expect(flag.description).toBe('Dataset to import to')
    expect(flag.helpGroup).toBeUndefined()
  })

  test('specify semantics: allows required override', () => {
    const flags = getDatasetFlag({
      description: 'Dataset to import to',
      required: true,
      semantics: 'specify',
    })
    const flag = flags.dataset
    expect(flag.required).toBe(true)
  })

  test('char is always d', () => {
    const flags = getDatasetFlag({semantics: 'override'})
    expect(flags.dataset.char).toBe('d')
  })

  test('parse trims and validates non-empty', async () => {
    const flags = getDatasetFlag({semantics: 'override'})
    const parse = flags.dataset.parse!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing parse in isolation, context/opts not used
    const invoke = (input: string) => parse(input, {} as any, {} as any)
    await expect(invoke('  staging  ')).resolves.toBe('staging')
    await expect(invoke('  ')).rejects.toThrow('cannot be empty')
  })
})
