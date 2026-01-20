import {join} from 'node:path'

import {testExample, testHook} from '@sanity/cli-test'
import dotenv from 'dotenv'
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
    const cwd = await testExample('basic-studio')
    process.chdir(cwd)

    const existingEnvVars = {}
    dotenv.config({path: join(cwd, '.env'), processEnv: existingEnvVars, quiet: true})

    const {Command, config} = await getCommandAndConfig('learn')

    await testHook<'prerun'>(injectEnvVariables, {
      Command,
      config,
    })

    expect(process.env).toMatchObject(existingEnvVars ?? {})
  })

  test('should inject env variables from apps', async () => {
    const cwd = await testExample('basic-app')
    process.chdir(cwd)

    const existingEnvVars = {}
    dotenv.config({path: join(cwd, '.env'), processEnv: existingEnvVars, quiet: true})

    const {Command, config} = await getCommandAndConfig('learn')

    await testHook<'prerun'>(injectEnvVariables, {
      Command,
      config,
    })

    expect(process.env).toMatchObject(existingEnvVars ?? {})
  })

  test('should warn when running in production environment', async () => {
    const cwd = await testExample('basic-studio')
    process.chdir(cwd)

    vi.stubEnv('SANITY_ACTIVE_ENV', 'production')

    const {Command, config} = await getCommandAndConfig('learn')

    const {stderr} = await testHook<'prerun'>(injectEnvVariables, {
      Command,
      config,
    })

    expect(stderr).toContain('Warning: Running in production environment')
  })
})
