import {type CliConfig} from '@sanity/cli-core'
import {describe, expect, test} from 'vitest'

import {unstable_defineMediaLibrary} from '../../../defineApp.js'
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

  test('maps tile views to tile interfaces, carrying size and order metadata', () => {
    const app = workbenchApp({
      views: [
        {
          name: 'agent',
          order: 100,
          size: 'large',
          src: './src/Tile.tsx',
          title: 'agent',
          type: 'tile',
        },
      ],
    })
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {
        id: 'test-app-tile-agent',
        metadata: {order: 100, size: 'large'},
        moduleId: 'views/agent',
        name: 'agent',
        src: './src/Tile.tsx',
        title: 'agent',
        type: 'tile',
        version: '1',
      },
    ])
  })

  test('maps a tile view without order to size-only metadata', () => {
    const app = workbenchApp({
      views: [{name: 'agent', size: 'small', src: './src/Tile.tsx', title: 'agent', type: 'tile'}],
    })
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {
        id: 'test-app-tile-agent',
        metadata: {size: 'small'},
        moduleId: 'views/agent',
        name: 'agent',
        src: './src/Tile.tsx',
        title: 'agent',
        type: 'tile',
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

  test('keys the id prefix and app-view name on name, not the slug address', () => {
    const app = workbenchApp({entry: './src/App.tsx', name: 'reviews', slug: 'reviews-host'})
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {
        id: 'reviews-app-reviews',
        metadata: null,
        moduleId: 'App',
        name: 'reviews',
        src: './src/App.tsx',
        title: 'Test App',
        type: 'app',
      },
    ])
  })

  test('inherits global placement metadata for panel and app views', () => {
    const app = workbenchApp({
      dock: {group: 'applications', order: 100},
      entry: './src/App.tsx',
      views: [
        {name: 'feed', src: './src/Feed.tsx', title: 'Feed', type: 'panel'},
        {
          group: 'user',
          name: 'settings',
          src: './src/Settings.tsx',
          title: 'Settings',
          type: 'app',
        },
        {
          name: 'inbox',
          order: 20,
          src: './src/Inbox.tsx',
          title: 'Inbox',
          type: 'panel',
        },
      ],
    })

    expect(
      deriveInterfaces(app, {isApp: true})
        .filter((iface) => iface.type === 'app' || iface.type === 'panel')
        .map(({metadata, name, type}) => ({metadata, name, type})),
    ).toEqual([
      {
        metadata: {group: 'applications', order: 100},
        name: 'feed',
        type: 'panel',
      },
      {
        metadata: {group: 'user', order: 100},
        name: 'settings',
        type: 'app',
      },
      {
        metadata: {group: 'applications', order: 20},
        name: 'inbox',
        type: 'panel',
      },
      {
        metadata: {group: 'applications', order: 100},
        name: 'test-app',
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

// deriveConfigs reads the config off the CLI config via resolveWorkbenchConfig.
const cfg = (app: unknown) => ({app}) as CliConfig
const mediaLibrary = (fields: {name: string; public?: boolean; src: string; title: string}[]) =>
  cfg(unstable_defineMediaLibrary({fields, organizationId: 'org-1'}))

describe('deriveConfigs', () => {
  test('returns [] for a non-branded app', async () => {
    await expect(deriveConfigs(cfg({title: 'Plain'}))).resolves.toEqual([])
    await expect(deriveConfigs(undefined)).resolves.toEqual([])
  })

  test('[] for an app (not a config), even one with interfaces', async () => {
    await expect(
      deriveConfigs(
        cfg(workbenchApp({views: [{name: 'feed', src: './f.tsx', title: 'feed', type: 'panel'}]})),
      ),
    ).resolves.toEqual([])
  })

  test('derives a config with no fields — keyed on its appType, not its fields', async () => {
    await expect(deriveConfigs(mediaLibrary([]))).resolves.toEqual([
      {
        appType: 'media-library',
        fields: [],
        id: expect.any(String),
        moduleName: 'media-library',
        version: '1',
      },
    ])
  })

  test('forwards the serializable config on the wire, keying moduleName on the target appType', async () => {
    const config = mediaLibrary([
      {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
      {name: 'language', src: './src/language.ts', title: 'Language'},
    ])
    await expect(deriveConfigs(config)).resolves.toEqual([
      {
        appType: 'media-library',
        fields: [
          {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
          {name: 'language', public: undefined, src: './src/language.ts', title: 'Language'},
        ],
        id: expect.any(String),
        moduleName: 'media-library',
        version: '1',
      },
    ])
  })

  test('id is stable for the same config and changes when the config changes', async () => {
    const config = mediaLibrary([
      {name: 'description', src: './src/description.ts', title: 'Description'},
    ])
    const edited = mediaLibrary([
      {name: 'description', src: './src/description.ts', title: 'Edited'},
    ])
    expect((await deriveConfigs(config))[0]?.id).toBe((await deriveConfigs(config))[0]?.id)
    expect((await deriveConfigs(edited))[0]?.id).not.toBe((await deriveConfigs(config))[0]?.id)
  })

  test("forwards the config's appType discriminator (assigns the singleton, no app id)", async () => {
    const config = mediaLibrary([
      {name: 'description', src: './src/description.ts', title: 'Description'},
    ])
    expect((await deriveConfigs(config))[0]?.appType).toBe('media-library')
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
