import {type CliConfig} from '@sanity/cli-core'
import {describe, expect, test} from 'vitest'

import {deriveInterfaces} from '../../../deriveInterfaces.js'
import {deriveConfigEntries, deriveConfigs} from '../deriveConfigs.js'
import {workbenchApp} from './devTestHelpers.js'

describe('deriveInterfaces', () => {
  test('derives nothing for a non-branded app (no unstable_defineApp)', () => {
    expect(deriveInterfaces({title: 'Plain'} as CliConfig['app'], {isApp: true})).toEqual([])
    expect(deriveInterfaces(undefined, {isApp: true})).toEqual([])
  })

  test('maps views to panel interfaces', () => {
    const app = workbenchApp({
      views: [{name: 'feed', src: './src/FeedPanel.tsx', title: 'feed', type: 'panel'}],
    })
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {
        id: 'test-app-panel-feed',
        metadata: null,
        moduleId: 'views/feed',
        name: 'feed',
        src: './src/FeedPanel.tsx',
        title: 'feed',
        type: 'panel',
        version: '1',
      },
    ])
  })

  test('maps asset_source views to asset_source interfaces', () => {
    const app = workbenchApp({
      views: [{name: 'library', src: './src/Picker.tsx', title: 'library', type: 'asset_source'}],
    })
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {
        id: 'test-app-asset_source-library',
        metadata: null,
        moduleId: 'views/library',
        name: 'library',
        src: './src/Picker.tsx',
        title: 'library',
        type: 'asset_source',
        version: '1',
      },
    ])
  })

  test('maps services to worker interfaces', () => {
    const app = workbenchApp({
      services: [{name: 'unread', src: './src/service.ts', title: 'unread', type: 'worker'}],
    })
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {
        id: 'test-app-worker-unread',
        metadata: null,
        moduleId: 'services/unread',
        name: 'unread',
        src: './src/service.ts',
        title: 'unread',
        type: 'worker',
        version: '1',
      },
    ])
  })

  test('derives an app interface from entry for an SDK app', () => {
    const app = workbenchApp({entry: './src/App.tsx', slug: 'my-app'})
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {
        id: 'my-app-app-my-app',
        metadata: null,
        moduleId: 'App',
        name: 'my-app',
        src: './src/App.tsx',
        title: 'Test App',
        type: 'app',
      },
    ])
  })

  test('stamps the moduleId a deploy would, so a local interface resolves like a deployed one', () => {
    const panelApp = workbenchApp({
      services: [{name: 'unread', src: './src/service.ts', title: 'unread', type: 'worker'}],
      views: [{name: 'feed', src: './src/FeedPanel.tsx', title: 'feed', type: 'panel'}],
    })
    expect(deriveInterfaces(panelApp, {isApp: true})?.map((iface) => iface.moduleId)).toEqual([
      'views/feed',
      'services/unread',
    ])

    const entryApp = workbenchApp({
      entry: './src/App.tsx',
      services: [{name: 'unread', src: './src/service.ts', title: 'unread', type: 'worker'}],
    })
    expect(deriveInterfaces(entryApp, {isApp: true})?.map((iface) => iface.moduleId)).toEqual([
      'services/unread',
      'App',
    ])
  })

  test('carries null metadata on every interface (not yet populated)', () => {
    const app = workbenchApp({
      entry: './src/App.tsx',
      services: [{name: 'unread', src: './src/service.ts', title: 'unread', type: 'worker'}],
    })
    expect(deriveInterfaces(app, {isApp: true})?.every((iface) => iface.metadata === null)).toBe(
      true,
    )
  })

  test('omits the app interface for a dock-only app (no entry)', () => {
    const app = workbenchApp({
      views: [{name: 'feed', src: './src/FeedPanel.tsx', title: 'feed', type: 'panel'}],
    })
    const result = deriveInterfaces(app, {isApp: true})
    expect(result?.some((iface) => iface.type === 'app')).toBe(false)
  })

  test('orders a panel view ahead of services', () => {
    const app = workbenchApp({
      services: [{name: 'unread', src: './src/service.ts', title: 'unread', type: 'worker'}],
      slug: 'my-app',
      views: [{name: 'feed', src: './src/FeedPanel.tsx', title: 'feed', type: 'panel'}],
    })
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {
        id: 'my-app-panel-feed',
        metadata: null,
        moduleId: 'views/feed',
        name: 'feed',
        src: './src/FeedPanel.tsx',
        title: 'feed',
        type: 'panel',
        version: '1',
      },
      {
        id: 'my-app-worker-unread',
        metadata: null,
        moduleId: 'services/unread',
        name: 'unread',
        src: './src/service.ts',
        title: 'unread',
        type: 'worker',
        version: '1',
      },
    ])
  })

  test('places the app view after services', () => {
    const app = workbenchApp({
      entry: './src/App.tsx',
      services: [{name: 'unread', src: './src/service.ts', title: 'unread', type: 'worker'}],
      slug: 'my-app',
    })
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {
        id: 'my-app-worker-unread',
        metadata: null,
        moduleId: 'services/unread',
        name: 'unread',
        src: './src/service.ts',
        title: 'unread',
        type: 'worker',
        version: '1',
      },
      {
        id: 'my-app-app-my-app',
        metadata: null,
        moduleId: 'App',
        name: 'my-app',
        src: './src/App.tsx',
        title: 'Test App',
        type: 'app',
      },
    ])
  })

  test('derives a unique id per interface, disambiguating a view and service that share a name', () => {
    const app = workbenchApp({
      services: [{name: 'sync', src: './src/sync.ts', title: 'sync', type: 'worker'}],
      slug: 'my-app',
      views: [{name: 'sync', src: './src/SyncPanel.tsx', title: 'sync', type: 'panel'}],
    })
    const ids = deriveInterfaces(app, {isApp: true})?.map((iface) => iface.id) ?? []
    expect(ids).toEqual(['my-app-panel-sync', 'my-app-worker-sync'])
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('derives interfaces best-effort without validating them', () => {
    // Validation is the caller's job (build/deploy throw, dev logs) — deriving
    // stays pure, so an invalid combination still maps to its records.
    const app = workbenchApp({
      entry: './src/App.tsx',
      views: [{name: 'feed', src: './src/FeedPanel.tsx', title: 'feed', type: 'panel'}],
    })
    expect(deriveInterfaces(app, {isApp: true})?.map((iface) => iface.type)).toEqual([
      'panel',
      'app',
    ])
  })

  test('does not put the config in the interface set', () => {
    const app = workbenchApp({
      config: {
        appType: 'media-library',
        fields: [{name: 'description', src: './src/description.ts', title: 'Description'}],
      },
      isSingleton: true,
      views: [{name: 'feed', src: './src/FeedPanel.tsx', title: 'feed', type: 'panel'}],
    })
    // only the panel — the config rides deriveConfigs, not interfaces
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {
        id: 'test-app-panel-feed',
        metadata: null,
        moduleId: 'views/feed',
        name: 'feed',
        src: './src/FeedPanel.tsx',
        title: 'feed',
        type: 'panel',
        version: '1',
      },
    ])
  })

  test('rejects a studio that declares entry', () => {
    const app = workbenchApp({entry: './src/App.tsx'})
    expect(() => deriveInterfaces(app, {isApp: false})).toThrow(
      'App views for studios are not implemented yet',
    )
  })

  test('derives a studio app interface from the generated entry, after its panels/workers', () => {
    const app = workbenchApp({
      views: [{name: 'feed', src: './src/FeedPanel.tsx', title: 'feed', type: 'panel'}],
    })
    expect(deriveInterfaces(app, {isApp: false})).toEqual([
      {
        id: 'test-app-panel-feed',
        metadata: null,
        moduleId: 'views/feed',
        name: 'feed',
        src: './src/FeedPanel.tsx',
        title: 'feed',
        type: 'panel',
        version: '1',
      },
      {
        id: 'test-app-app-test-app',
        metadata: null,
        moduleId: 'App',
        name: 'test-app',
        src: './.sanity/federation/remote-entry.jsx',
        title: 'Test App',
        type: 'app',
      },
    ])
  })
})

describe('deriveConfigs', () => {
  test('returns [] for a non-branded app', async () => {
    await expect(deriveConfigs({title: 'Plain'} as CliConfig['app'])).resolves.toEqual([])
    await expect(deriveConfigs(undefined)).resolves.toEqual([])
  })

  test('[] for an app with no config', async () => {
    await expect(
      deriveConfigs(
        workbenchApp({views: [{name: 'feed', src: './f.tsx', title: 'feed', type: 'panel'}]}),
      ),
    ).resolves.toEqual([])
  })

  test('forwards the serializable config on the wire, keeping `src` as each field entry', async () => {
    const app = workbenchApp({
      config: {
        appType: 'media-library',
        fields: [
          {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
          {name: 'language', src: './src/language.ts', title: 'Language'},
        ],
      },
      isSingleton: true,
    })
    await expect(deriveConfigs(app)).resolves.toEqual([
      {
        appType: 'media-library',
        fields: [
          {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
          {name: 'language', public: undefined, src: './src/language.ts', title: 'Language'},
        ],
        id: expect.any(String),
        moduleName: 'test-app',
        version: '1',
      },
    ])
  })

  test('id is stable for the same config and changes when the config changes', async () => {
    const config = {
      appType: 'media-library' as const,
      fields: [{name: 'description', src: './src/description.ts', title: 'Description'}],
    }
    const app = workbenchApp({config, isSingleton: true})
    const edited = workbenchApp({
      config: {...config, fields: [{...config.fields[0]!, title: 'Edited'}]},
      isSingleton: true,
    })
    expect((await deriveConfigs(app))[0]?.id).toBe((await deriveConfigs(app))[0]?.id)
    expect((await deriveConfigs(edited))[0]?.id).not.toBe((await deriveConfigs(app))[0]?.id)
  })

  test("forwards the config's appType discriminator (assigns the singleton, no app id)", async () => {
    const app = workbenchApp({
      applicationType: 'media-library',
      config: {
        appType: 'media-library',
        fields: [{name: 'description', src: './src/description.ts', title: 'Description'}],
      },
      isSingleton: true,
    })
    expect((await deriveConfigs(app))[0]?.appType).toBe('media-library')
  })

  test('rejects an config on a non-singleton app', async () => {
    const app = workbenchApp({
      config: {
        appType: 'media-library',
        fields: [{name: 'description', src: './src/description.ts', title: 'Description'}],
      },
    })
    await expect(deriveConfigs(app)).rejects.toThrow(/only supported for singleton apps/)
  })
})

describe('deriveConfigEntries', () => {
  test('projects each field to its name + src, dropping render-only metadata', () => {
    expect(
      deriveConfigEntries({
        appType: 'media-library',
        fields: [
          {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
          {name: 'language', src: './src/language.ts', title: 'Language'},
        ],
        id: 'cfg-hash',
        version: '1',
      }),
    ).toEqual([
      {name: 'description', src: './src/description.ts'},
      {name: 'language', src: './src/language.ts'},
    ])
  })

  test('an empty field set yields no entries', () => {
    expect(
      deriveConfigEntries({appType: 'media-library', fields: [], id: 'cfg-hash', version: '1'}),
    ).toEqual([])
  })

  test('throws on an app type it cannot handle', () => {
    expect(() =>
      deriveConfigEntries({appType: 'core-app', fields: [], id: 'cfg-hash', version: '1'}),
    ).toThrow(/unknown config appType: core-app/i)
  })
})
