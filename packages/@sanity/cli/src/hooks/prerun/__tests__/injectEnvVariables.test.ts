import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {testFixture, testHook} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {getCommandAndConfig} from '~test/helpers/getCommandAndConfig.js'

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

    // Create a .env file with a SANITY_TEST_VAR variable
    await writeFile(join(cwd, '.env'), 'SANITY_STUDIO_TEST_VAR=test\nNOT_SANITY_VAR=test2')

    const {Command, config} = await getCommandAndConfig('learn')

    await testHook<'prerun'>(injectEnvVariables, {
      Command,
      config,
    })

    expect(process.env.SANITY_STUDIO_TEST_VAR).toBe('test')
    expect(process.env.NOT_SANITY_VAR).not.toBe('test2')
  })

  test('should inject env variables from apps', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    // Create a .env file with a SANITY_TEST_VAR variable
    await writeFile(join(cwd, '.env'), 'SANITY_APP_TEST_VAR=test\nNOT_SANITY_VAR=test2')

    const {Command, config} = await getCommandAndConfig('learn')

    await testHook<'prerun'>(injectEnvVariables, {
      Command,
      config,
    })

    expect(process.env.SANITY_APP_TEST_VAR).toBe('test')
    expect(process.env.NOT_SANITY_VAR).not.toBe('test2')
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
})
