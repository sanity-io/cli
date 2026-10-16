import {tmpdir} from 'node:os'

import {Flags} from '@oclif/core'
import {describe, expect, test} from 'vitest'

import {
  fromCliConfig,
  isFromCliConfig,
  mcpFlagOverrides,
  mcpOverrides,
  requiredWhenUnattended,
  resolveUnattendedFlagRequirements,
} from '../_exports/flags.js'
import {runWithCliExecutionContext} from '../executionContext.js'

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
    })

    expect(flag.description).toBe('terminal help')
    expect(flag.required).toBeFalsy()
    expect(mcpFlagOverrides(flag)).toEqual({description: 'agent copy'})
    expect(mcpFlagOverrides(Flags.string({description: 'plain'}))).toBeUndefined()
  })

  test('fromCliConfig tags the flag and stays inert without a project', async () => {
    const flag = Flags.string({
      description: 'Organization ID',
      ...fromCliConfig((config) => config.app?.organizationId),
    })

    expect(isFromCliConfig(flag)).toBe(true)
    expect(flag.noCacheDefault).toBe(true)
    expect(isFromCliConfig(Flags.string({description: 'plain'}))).toBe(false)

    // Outside any Sanity project the default resolves to nothing: the
    // command's own fallback (prompt or error) applies.
    const cwd = process.cwd()
    process.chdir(tmpdir())
    try {
      expect(await (flag.default as () => Promise<string | undefined>)()).toBeUndefined()
    } finally {
      process.chdir(cwd)
    }
  })

  test('fromCliConfig never reads local config under an execution context', async () => {
    // Guarded by findProjectRoot: programmatic invocations must not execute a
    // host project's sanity.cli.ts. This pins the whole chain.
    const flag = Flags.string({
      ...fromCliConfig(() => {
        throw new Error('config must not be read')
      }),
    })

    const value = await runWithCliExecutionContext({}, () =>
      (flag.default as () => Promise<string | undefined>)(),
    )
    expect(value).toBeUndefined()
  })
})
