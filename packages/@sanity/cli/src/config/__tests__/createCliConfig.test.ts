import {type CliConfig} from '@sanity/cli-core'
import {describe, expect, expectTypeOf, test} from 'vitest'

import {createCliConfig} from '../createCliConfig.js'

describe('#createCliConfig', () => {
  test('should return config unchanged and preserve object identity', () => {
    const config: CliConfig = {
      api: {
        dataset: 'production',
        projectId: 'test-project',
      },
      server: {
        hostname: 'localhost',
        port: 3333,
      },
    }

    const result = createCliConfig(config)

    // Returns the exact same object reference (no transformation)
    expect(result).toBe(config)
    expect(result).toEqual(config)
  })

  test('createCliConfig type is CliConfig', () => {
    expectTypeOf<ReturnType<typeof createCliConfig>>().toEqualTypeOf<CliConfig>()
  })
})
