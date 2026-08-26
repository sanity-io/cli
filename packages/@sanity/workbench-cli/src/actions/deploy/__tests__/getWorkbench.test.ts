import {type CliConfig} from '@sanity/cli-core'
import {describe, expect, test} from 'vitest'

import {
  type DefineAppInput,
  defineApplication,
  unstable_defineMediaLibrary,
} from '../../../defineApp.js'
import {getWorkbench} from '../getWorkbench.js'

// Resolve a capability from a real branded app — the only way to a non-null
// result, so every test exercises the actual `defineApplication` brand rather
// than a hand-rolled stand-in.
function workbench(overrides: Partial<DefineAppInput> = {}) {
  const app = defineApplication({
    organizationId: 'org-id',
    slug: 'test-app',
    title: 'Test App',
    ...overrides,
  })
  const resolved = getWorkbench({app} as CliConfig)
  if (!resolved) throw new Error('expected a workbench app')
  return resolved
}

describe('getWorkbench', () => {
  test('returns null for a plain, non-branded config', () => {
    expect(getWorkbench({app: {title: 'plain'}} as CliConfig)).toBeNull()
    expect(getWorkbench({} as CliConfig)).toBeNull()
    expect(getWorkbench(undefined)).toBeNull()
  })

  test('returns null for a media library config — a config is not an app', () => {
    const app = unstable_defineMediaLibrary({organizationId: 'org-id'})
    expect(getWorkbench({app} as CliConfig)).toBeNull()
  })

  test('exposes the declared interfaces off the branded app', () => {
    const resolved = workbench({
      services: [{name: 'sync', src: './src/sync.ts', title: 'sync', type: 'worker'}],
      views: [{name: 'panel', src: './src/panel.tsx', title: 'panel', type: 'panel'}],
    })
    expect(resolved.views).toHaveLength(1)
    expect(resolved.services).toHaveLength(1)
  })

  test('exposes an entry app off the branded app', () => {
    const resolved = workbench({entry: './src/App.tsx'})
    expect(resolved.entry).toBe('./src/App.tsx')
  })
})

describe('buildViewDeploymentPayload', () => {
  test('includes every declared window view', () => {
    const views = [
      {name: 'main', src: './src/Main.tsx', title: 'Main', type: 'app' as const},
      {name: 'settings', src: './src/Settings.tsx', title: 'Settings', type: 'app' as const},
    ]

    expect(workbench({views}).buildViewDeploymentPayload('app-id')).toEqual({
      applicationId: 'app-id',
      views,
    })
  })
})

describe('assertDeployable', () => {
  test('throws when the app declares no interfaces', () => {
    expect(() => workbench().assertDeployable()).toThrow('declares no entry, views or services')
  })

  test('throws when views and services are empty arrays', () => {
    expect(() => workbench({services: [], views: []}).assertDeployable()).toThrow(
      'declares no entry, views or services',
    )
  })

  test('passes when the app declares an entry', () => {
    expect(() => workbench({entry: './src/App.tsx'}).assertDeployable()).not.toThrow()
  })

  test('passes when the app declares a view', () => {
    expect(() =>
      workbench({
        views: [{name: 'panel', src: './src/panel.tsx', title: 'panel', type: 'panel'}],
      }).assertDeployable(),
    ).not.toThrow()
  })

  test('passes when the app declares a service', () => {
    expect(() =>
      workbench({
        services: [{name: 'sync', src: './src/sync.ts', title: 'sync', type: 'worker'}],
      }).assertDeployable(),
    ).not.toThrow()
  })
})

describe('hasInterfaces', () => {
  test('an app that declares interfaces reports them', () => {
    const resolved = workbench({
      views: [{name: 'panel', src: './src/panel.tsx', title: 'panel', type: 'panel'}],
    })
    expect(resolved.hasInterfaces).toBe(true)
  })

  test('an app with no entry, views, or services hosts nothing', () => {
    expect(workbench().hasInterfaces).toBe(false)
  })
})
