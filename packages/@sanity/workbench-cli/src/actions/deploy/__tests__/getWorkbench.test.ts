import {type CliConfig} from '@sanity/cli-core'
import {describe, expect, test} from 'vitest'

import {
  type DefineAppInput,
  type DefineMediaLibraryInput,
  unstable_defineApp,
  unstable_defineMediaLibrary,
} from '../../../defineApp.js'
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

// A media library resolves through the same brand, but declares installation
// configs (via `fields`) instead of interfaces.
function mediaLibrary(overrides: Partial<DefineMediaLibraryInput> = {}) {
  const app = unstable_defineMediaLibrary({organizationId: 'org-id', ...overrides})
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

  test('exposes the config off a branded media library', () => {
    const resolved = mediaLibrary({
      fields: [
        {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
      ],
    })
    expect(resolved.applicationType).toBe('media-library')
    expect(resolved.config).toMatchObject({fields: [{name: 'description'}]})
    // a media library declares no interfaces
    expect(resolved.views).toHaveLength(0)
    expect(resolved.services).toHaveLength(0)
  })
})

describe('assertDeployable', () => {
  test('throws when the app declares no interfaces', () => {
    expect(() => workbench().assertDeployable()).toThrow(
      'declares no entry, views, services or config',
    )
  })

  test('throws when views and services are empty arrays', () => {
    expect(() => workbench({services: [], views: []}).assertDeployable()).toThrow(
      'declares no entry, views, services or config',
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

  test('passes when a media library declares a field', () => {
    expect(() =>
      mediaLibrary({
        fields: [{name: 'description', src: './src/description.ts', title: 'Description'}],
      }).assertDeployable(),
    ).not.toThrow()
  })

  test('throws when a media library declares no fields', () => {
    expect(() => mediaLibrary().assertDeployable()).toThrow(
      'declares no entry, views, services or config',
    )
  })
})

describe('deploySingletonConfig / hasInterfaces', () => {
  test('a media library with fields deploys its config and hosts no interfaces', () => {
    const resolved = mediaLibrary({
      fields: [{name: 'description', src: './src/description.ts', title: 'Description'}],
    })
    expect(resolved.deploySingletonConfig).toBe(true)
    expect(resolved.hasInterfaces).toBe(false)
  })

  test('a media library without fields carries no config to deploy', () => {
    expect(mediaLibrary().deploySingletonConfig).toBe(false)
  })

  test('a non-singleton app never deploys a config, and reports its interfaces', () => {
    const resolved = workbench({
      views: [{name: 'views/panel', src: './src/panel.tsx', type: 'panel'}],
    })
    expect(resolved.deploySingletonConfig).toBe(false)
    expect(resolved.hasInterfaces).toBe(true)
  })
})
