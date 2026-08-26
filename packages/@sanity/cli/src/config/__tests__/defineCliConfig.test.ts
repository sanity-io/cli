import {type CliConfig} from '@sanity/cli-core'
import {type DefineAppResult, unstable_defineApp} from '@sanity/workbench-cli'
import {describe, expect, expectTypeOf, test} from 'vitest'

import {defineCliConfig} from '../defineCliConfig.js'

describe('#defineCliConfig', () => {
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

    const result = defineCliConfig(config)

    expect(result).toBe(config)
  })

  test('defineCliConfig type is CliConfig', () => {
    expectTypeOf<ReturnType<typeof defineCliConfig>>().toEqualTypeOf<CliConfig>()
  })
})

// An `unstable_defineApp(...)` result fits `CliConfig['app']` only because every
// field declared there is optional; nothing in the type states the relationship.
describe('the `app` config slot', () => {
  test('accepts an `unstable_defineApp` result, workbench fields and all', () => {
    expectTypeOf<DefineAppResult>().toExtend<CliConfig['app']>()

    defineCliConfig({
      app: unstable_defineApp({
        dock: {group: 'dock.system', order: 20},
        organizationId: 'org-1',
        slug: 'my-app',
        title: 'My App',
      }),
    })
  })

  // One literal only ever reports its first excess property, so one call each.
  test('rejects workbench fields written by hand', () => {
    defineCliConfig({
      app: {
        // @ts-expect-error `dock` comes from `unstable_defineApp`
        dock: {group: 'dock.system', order: 20},
        organizationId: 'org-1',
      },
    })
  })
})
