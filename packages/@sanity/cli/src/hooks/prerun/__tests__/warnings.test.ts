import {testHook} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {getCommandAndConfig} from '~test/helpers/getCommandAndConfig.js'

import {warnings} from '../warnings.js'

const {config} = await getCommandAndConfig('help')
let originalEnv: Record<string, string>

describe('warnings hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    originalEnv = {...process.env} as Record<string, string>
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('warnOnUnsupportedRuntime', () => {
    test('should not warn when engines not defined', async () => {
      const customConfig = {
        ...config,
        pjson: {
          ...config.pjson,
          engines: undefined,
        },
      } as unknown as typeof config

      const {stderr} = await testHook<'prerun'>(warnings, {config: customConfig})

      expect(stderr).toBe('')
    })

    test('should not warn when Node version satisfies requirement', async () => {
      const currentNodeVersion = process.versions.node
      const [major] = currentNodeVersion.split('.')

      const customConfig = {
        ...config,
        pjson: {
          ...config.pjson,
          engines: {
            node: `>=${major}.0.0`,
          },
        },
      } as unknown as typeof config

      const {stderr} = await testHook<'prerun'>(warnings, {config: customConfig})

      expect(stderr).toBe('')
    })

    test('should warn when Node version does not satisfy requirement', async () => {
      const customConfig = {
        ...config,
        pjson: {
          ...config.pjson,
          engines: {
            node: '>=99.0.0',
          },
        },
      } as unknown as typeof config

      const {stderr} = await testHook<'prerun'>(warnings, {config: customConfig})

      expect(stderr).toContain('The current Node.js version')
      expect(stderr).toContain('is not supported')
      expect(stderr).toContain('Please upgrade to a version that satisfies the range')
      expect(stderr).toContain('>=99.0.0')
    })
  })

  describe('warnOnNonProductionEnvironment', () => {
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

  describe('integration', () => {
    test('should show both warnings together', async () => {
      vi.stubEnv('SANITY_INTERNAL_ENV', 'development')
      vi.stubEnv('TEST', '')

      const customConfig = {
        ...config,
        pjson: {
          ...config.pjson,
          engines: {
            node: '>=99.0.0',
          },
        },
      } as unknown as typeof config

      const {stderr} = await testHook<'prerun'>(warnings, {config: customConfig})

      expect(stderr).toContain('The current Node.js version')
      expect(stderr).toContain('is not supported')
      expect(stderr).toContain('>=99.0.0')
      expect(stderr).toContain('Running in development environment mode')
    })
  })
})
