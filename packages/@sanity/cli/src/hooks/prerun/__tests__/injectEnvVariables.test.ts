import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {testFixture, testHook} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getCommandAndConfig} from '../../../../test/helpers/getCommandAndConfig.js'
import {injectEnvVariables} from '../injectEnvVariables.js'

// Finds the command to test, first loads the config and then finds the command

let originalEnv: Record<string, string>

describe('#injectEnvVariables', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    originalEnv = {...process.env} as Record<string, string>
  })

  afterEach(() => {
    process.env = originalEnv
  })

  test('should inject env variables from studios', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    await writeFile(
      join(cwd, '.env'),
      'SANITY_STUDIO_TEST_VAR=test\nDATABASE_URL=postgres://localhost\nNEXT_PUBLIC_SANITY_PROJECT_ID=test-project',
    )

    const {Command, config} = await getCommandAndConfig('learn')

    await testHook<'prerun'>(injectEnvVariables, {
      Command,
      config,
    })

    expect(process.env.SANITY_STUDIO_TEST_VAR).toBe('test')
    expect(process.env.DATABASE_URL).toBe('postgres://localhost')
    expect(process.env.NEXT_PUBLIC_SANITY_PROJECT_ID).toBe('test-project')
  })

  test('should inject env variables from apps', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    await writeFile(join(cwd, '.env'), 'SANITY_APP_TEST_VAR=test\nMY_CUSTOM_VAR=test2')

    const {Command, config} = await getCommandAndConfig('learn')

    await testHook<'prerun'>(injectEnvVariables, {
      Command,
      config,
    })

    expect(process.env.SANITY_APP_TEST_VAR).toBe('test')
    expect(process.env.MY_CUSTOM_VAR).toBe('test2')
  })

  test('should warn when running in production environment', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    vi.stubEnv('SANITY_ACTIVE_ENV', 'production')

    const {Command, config} = await getCommandAndConfig('learn')

    const {stderr} = await testHook<'prerun'>(injectEnvVariables, {
      Command,
      config,
    })

    expect(stderr).toContain('Running in production environment')
  })

  test('should inject SANITY_INTERNAL_ENV from .env', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    await writeFile(join(cwd, '.env'), 'SANITY_INTERNAL_ENV=staging')

    const {Command, config} = await getCommandAndConfig('learn')

    await testHook<'prerun'>(injectEnvVariables, {
      Command,
      config,
    })

    expect(process.env.SANITY_INTERNAL_ENV).toBe('staging')
  })

  test('should not error when no project root is found', async () => {
    const cwd = await testFixture('basic-functions')
    process.chdir(cwd)

    const {Command, config} = await getCommandAndConfig('learn')

    const {error, stderr} = await testHook<'prerun'>(injectEnvVariables, {
      Command,
      config,
    })

    if (error) throw error
    expect(stderr).not.toContain('Error: No project root found')
  })
})
