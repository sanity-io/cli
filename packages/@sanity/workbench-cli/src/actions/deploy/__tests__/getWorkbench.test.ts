import {type CliConfig} from '@sanity/cli-core/types'
import {describe, expect, test} from 'vitest'

import {type DefineAppInput, unstable_defineApp} from '../../../defineApp.js'
import {getWorkbench} from '../getWorkbench.js'

// Resolve a capability from a real branded app — the only way to a non-null
// result, so every test exercises the actual `unstable_defineApp` brand rather
// than a hand-rolled stand-in.
function workbench(overrides: Partial<DefineAppInput> = {}) {
  const app = unstable_defineApp({
    name: 'test-app',
    organizationId: 'org-id',
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

  test('exposes the declared interfaces off the branded app', () => {
    const resolved = workbench({
      entry: './src/App.tsx',
      services: [{name: 'services/sync', src: './src/sync.ts', type: 'worker'}],
      views: [{name: 'views/panel', src: './src/panel.tsx', type: 'panel'}],
    })
    expect(resolved.entry).toBe('./src/App.tsx')
    expect(resolved.views).toHaveLength(1)
    expect(resolved.services).toHaveLength(1)
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
        views: [{name: 'views/panel', src: './src/panel.tsx', type: 'panel'}],
      }).assertDeployable(),
    ).not.toThrow()
  })

  test('passes when the app declares a service', () => {
    expect(() =>
      workbench({
        services: [{name: 'services/sync', src: './src/sync.ts', type: 'worker'}],
      }).assertDeployable(),
    ).not.toThrow()
  })
})
