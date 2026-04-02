import {testHook} from '@sanity/cli-test'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {getCommandAndConfig} from '../../../../test/helpers/getCommandAndConfig.js'
import {warnings} from '../warnings.js'

const {config} = await getCommandAndConfig('help')

describe('#warnings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  test('should not warn in production environment', async () => {
    const {stderr: defaultStderr} = await testHook<'prerun'>(warnings, {config})
    expect(defaultStderr).toBe('')

    vi.stubEnv('SANITY_INTERNAL_ENV', 'production')
    const {stderr: explicitStderr} = await testHook<'prerun'>(warnings, {config})
    expect(explicitStderr).toBe('')
  })

  test.each([
    {env: 'development', expectedText: 'Running in development environment mode'},
    {env: 'staging', expectedText: 'Running in staging environment mode'},
  ])('should warn in $env environment', async ({env, expectedText}) => {
    vi.stubEnv('SANITY_INTERNAL_ENV', env)
    vi.stubEnv('TEST', '')

    const {stderr} = await testHook<'prerun'>(warnings, {config})

    expect(stderr).toContain(expectedText)
  })

  test('should warn for unknown environment', async () => {
    vi.stubEnv('SANITY_INTERNAL_ENV', 'custom-env')
    vi.stubEnv('TEST', '')

    const {stderr} = await testHook<'prerun'>(warnings, {config})

    expect(stderr).toContain('Running in')
    expect(stderr).toContain('UNKNOWN')
    expect(stderr).toContain('"custom-env"')
    expect(stderr).toContain('environment mode')
  })

  test('should not warn in test mode', async () => {
    vi.stubEnv('SANITY_INTERNAL_ENV', 'development')
    vi.stubEnv('TEST', 'true')

    const {stderr} = await testHook<'prerun'>(warnings, {config})

    expect(stderr).toBe('')
  })
})
