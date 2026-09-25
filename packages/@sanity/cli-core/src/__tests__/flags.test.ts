import {Flags} from '@oclif/core'
import {describe, expect, test} from 'vitest'

import {
  mcpFlagOverrides,
  mcpOverrides,
  requiredWhenUnattended,
  resolveUnattendedFlagRequirements,
} from '../_exports/flags.js'

describe('Flags', () => {
  test('supports unattended requirements for every flag type', () => {
    const flags = {
      boolean: requiredWhenUnattended(Flags.boolean()),
      custom: requiredWhenUnattended(
        Flags.custom<number>({parse: async (value) => Number(value)})(),
      ),
      directory: requiredWhenUnattended(Flags.directory()),
      file: requiredWhenUnattended(Flags.file()),
      integer: requiredWhenUnattended(Flags.integer()),
      option: requiredWhenUnattended(Flags.option({options: ['one', 'two'] as const})()),
      string: requiredWhenUnattended(Flags.string()),
      url: requiredWhenUnattended(Flags.url()),
    }

    expect(
      Object.values(resolveUnattendedFlagRequirements(flags, true)).every(
        (flag) => flag.required === true,
      ),
    ).toBe(true)
    expect(
      Object.values(resolveUnattendedFlagRequirements(flags, false)).every(
        (flag) => flag.required === false,
      ),
    ).toBe(true)
  })

  test('mcpOverrides annotates MCP deviations without touching the flag', () => {
    const flag = mcpOverrides(Flags.string({description: 'terminal help'}), {
      description: 'agent copy',
      required: true,
    })

    expect(flag.description).toBe('terminal help')
    expect(flag.required).toBeFalsy()
    expect(mcpFlagOverrides(flag)).toEqual({description: 'agent copy', required: true})
    expect(mcpFlagOverrides(Flags.string({description: 'plain'}))).toBeUndefined()
  })
})
