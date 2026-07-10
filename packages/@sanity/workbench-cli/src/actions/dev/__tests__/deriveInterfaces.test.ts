import {type CliConfig} from '@sanity/cli-core/types'
import {describe, expect, test} from 'vitest'

import {deriveConfigEntries, deriveConfigs, deriveInterfaces} from '../deriveInterfaces.js'
import {workbenchApp} from './devTestHelpers.js'

describe('deriveInterfaces', () => {
  test('returns undefined for a non-branded app (no unstable_defineApp)', () => {
    expect(deriveInterfaces({title: 'Plain'} as CliConfig['app'], {isApp: true})).toBeUndefined()
    expect(deriveInterfaces(undefined, {isApp: true})).toBeUndefined()
  })

  test('maps views to panel interfaces', () => {
    const app = workbenchApp({views: [{name: 'feed', src: './src/FeedPanel.tsx', type: 'panel'}]})
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {entry_point: './src/FeedPanel.tsx', interface_type: 'panel', name: 'feed', version: 1},
    ])
  })

  test('maps services to worker interfaces', () => {
    const app = workbenchApp({
      services: [{name: 'unread', src: './src/service.ts', type: 'worker'}],
    })
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {entry_point: './src/service.ts', interface_type: 'worker', name: 'unread', version: 1},
    ])
  })

  test('derives an app interface from entry for an SDK app', () => {
    const app = workbenchApp({entry: './src/App.tsx', name: 'my-app'})
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {entry_point: './src/App.tsx', interface_type: 'app', name: 'my-app'},
    ])
  })

  test('omits the app interface for a dock-only app (no entry)', () => {
    const app = workbenchApp({views: [{name: 'feed', src: './src/FeedPanel.tsx', type: 'panel'}]})
    const result = deriveInterfaces(app, {isApp: true})
    expect(result?.some((iface) => iface.interface_type === 'app')).toBe(false)
  })

  test('combines views, services, and the app view (in that order)', () => {
    const app = workbenchApp({
      entry: './src/App.tsx',
      name: 'my-app',
      services: [{name: 'unread', src: './src/service.ts', type: 'worker'}],
      views: [{name: 'feed', src: './src/FeedPanel.tsx', type: 'panel'}],
    })
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {entry_point: './src/FeedPanel.tsx', interface_type: 'panel', name: 'feed', version: 1},
      {entry_point: './src/service.ts', interface_type: 'worker', name: 'unread', version: 1},
      {entry_point: './src/App.tsx', interface_type: 'app', name: 'my-app'},
    ])
  })

  test('does not put the config in the interface set', () => {
    const app = workbenchApp({
      config: {
        appType: 'media-library',
        fields: [{name: 'description', src: './src/description.ts', title: 'Description'}],
      },
      views: [{name: 'feed', src: './src/FeedPanel.tsx', type: 'panel'}],
    })
    // only the panel — the config rides deriveConfigs, not interfaces
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {entry_point: './src/FeedPanel.tsx', interface_type: 'panel', name: 'feed', version: 1},
    ])
  })

  test('rejects a studio that declares entry', () => {
    const app = workbenchApp({entry: './src/App.tsx'})
    expect(() => deriveInterfaces(app, {isApp: false})).toThrow(
      'App views for studios are not implemented yet',
    )
  })

  test('a studio without entry still derives its panels/workers', () => {
    const app = workbenchApp({views: [{name: 'feed', src: './src/FeedPanel.tsx', type: 'panel'}]})
    expect(deriveInterfaces(app, {isApp: false})).toEqual([
      {entry_point: './src/FeedPanel.tsx', interface_type: 'panel', name: 'feed', version: 1},
    ])
  })
})

describe('deriveConfigs', () => {
  test('returns [] for a non-branded app', () => {
    expect(deriveConfigs({title: 'Plain'} as CliConfig['app'])).toEqual([])
    expect(deriveConfigs(undefined)).toEqual([])
  })

  test('[] for an app with no config', () => {
    expect(
      deriveConfigs(workbenchApp({views: [{name: 'feed', src: './f.tsx', type: 'panel'}]})),
    ).toEqual([])
  })

  test('forwards the serializable config on the wire, keeping `src` as each field entry', () => {
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
    expect(deriveConfigs(app)).toEqual([
      {
        appType: 'media-library',
        fields: [
          {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
          {name: 'language', public: undefined, src: './src/language.ts', title: 'Language'},
        ],
        id: expect.any(String),
        moduleName: 'test-app',
        version: 1,
      },
    ])
  })

  test('id is stable for the same config and changes when the config changes', () => {
    const config = {
      appType: 'media-library' as const,
      fields: [{name: 'description', src: './src/description.ts', title: 'Description'}],
    }
    const app = workbenchApp({config, isSingleton: true})
    const edited = workbenchApp({
      config: {...config, fields: [{...config.fields[0]!, title: 'Edited'}]},
      isSingleton: true,
    })
    expect(deriveConfigs(app)[0]?.id).toBe(deriveConfigs(app)[0]?.id)
    expect(deriveConfigs(edited)[0]?.id).not.toBe(deriveConfigs(app)[0]?.id)
  })

  test("forwards the config's appType discriminator (assigns the singleton, no app id)", () => {
    const app = workbenchApp({
      applicationType: 'media-library',
      config: {
        appType: 'media-library',
        fields: [{name: 'description', src: './src/description.ts', title: 'Description'}],
      },
      isSingleton: true,
    })
    expect(deriveConfigs(app)[0]?.appType).toBe('media-library')
  })

  test('rejects an config on a non-singleton app', () => {
    const app = workbenchApp({
      config: {
        appType: 'media-library',
        fields: [{name: 'description', src: './src/description.ts', title: 'Description'}],
      },
    })
    expect(() => deriveConfigs(app)).toThrow(/only supported for singleton apps/)
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
        version: 1,
      }),
    ).toEqual([
      {name: 'description', src: './src/description.ts'},
      {name: 'language', src: './src/language.ts'},
    ])
  })

  test('an empty field set yields no entries', () => {
    expect(
      deriveConfigEntries({appType: 'media-library', fields: [], id: 'cfg-hash', version: 1}),
    ).toEqual([])
  })

  test('throws on an app type it cannot handle', () => {
    expect(() =>
      deriveConfigEntries({appType: 'core-app', fields: [], id: 'cfg-hash', version: 1}),
    ).toThrow(/unknown config appType: core-app/i)
  })
})
