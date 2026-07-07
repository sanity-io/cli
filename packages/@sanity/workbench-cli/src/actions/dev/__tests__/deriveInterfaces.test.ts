import {type CliConfig} from '@sanity/cli-core'
import {describe, expect, test} from 'vitest'

import {
  deriveInstallationConfigEntries,
  deriveInstallationConfigs,
  deriveInterfaces,
} from '../deriveInterfaces.js'
import {workbenchApp} from './devTestHelpers.js'

describe('deriveInterfaces', () => {
  test('returns undefined for a non-branded app (no unstable_defineApp)', () => {
    expect(deriveInterfaces({title: 'Plain'} as CliConfig['app'], {isApp: true})).toBeUndefined()
    expect(deriveInterfaces(undefined, {isApp: true})).toBeUndefined()
  })

  test('maps views to panel interfaces', () => {
    const app = workbenchApp({views: [{name: 'feed', src: './src/FeedPanel.tsx', type: 'panel'}]})
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {entry_point: './src/FeedPanel.tsx', interface_type: 'panel', name: 'feed'},
    ])
  })

  test('maps services to worker interfaces', () => {
    const app = workbenchApp({
      services: [{name: 'unread', src: './src/service.ts', type: 'worker'}],
    })
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {entry_point: './src/service.ts', interface_type: 'worker', name: 'unread'},
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
      {entry_point: './src/FeedPanel.tsx', interface_type: 'panel', name: 'feed'},
      {entry_point: './src/service.ts', interface_type: 'worker', name: 'unread'},
      {entry_point: './src/App.tsx', interface_type: 'app', name: 'my-app'},
    ])
  })

  test('does not put the installation config in the interface set', () => {
    const app = workbenchApp({
      installationConfig: {
        appType: 'media-library',
        fields: [{name: 'description', src: './src/description.ts', title: 'Description'}],
      },
      views: [{name: 'feed', src: './src/FeedPanel.tsx', type: 'panel'}],
    })
    // only the panel — the config rides deriveInstallationConfigs, not interfaces
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {entry_point: './src/FeedPanel.tsx', interface_type: 'panel', name: 'feed'},
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
      {entry_point: './src/FeedPanel.tsx', interface_type: 'panel', name: 'feed'},
    ])
  })
})

describe('deriveInstallationConfigs', () => {
  test('returns [] for a non-branded app', () => {
    expect(deriveInstallationConfigs({title: 'Plain'} as CliConfig['app'])).toEqual([])
    expect(deriveInstallationConfigs(undefined)).toEqual([])
  })

  test('[] for an app with no installation config', () => {
    expect(
      deriveInstallationConfigs(
        workbenchApp({views: [{name: 'feed', src: './f.tsx', type: 'panel'}]}),
      ),
    ).toEqual([])
  })

  test('forwards the serializable config on the wire, keeping `src` as each field entry', () => {
    const app = workbenchApp({
      installationConfig: {
        appType: 'media-library',
        fields: [
          {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
          {name: 'language', src: './src/language.ts', title: 'Language'},
        ],
      },
    })
    expect(deriveInstallationConfigs(app)).toEqual([
      {
        appType: 'media-library',
        fields: [
          {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
          {name: 'language', public: undefined, src: './src/language.ts', title: 'Language'},
        ],
        moduleName: 'test-app',
      },
    ])
  })

  test("forwards the config's appType discriminator (assigns the singleton, no app id)", () => {
    const app = workbenchApp({
      applicationType: 'media-library',
      installationConfig: {
        appType: 'media-library',
        fields: [{name: 'description', src: './src/description.ts', title: 'Description'}],
      },
    })
    expect(deriveInstallationConfigs(app)[0]?.appType).toBe('media-library')
  })
})

describe('deriveInstallationConfigEntries', () => {
  test('projects each field to its name + src, dropping render-only metadata', () => {
    expect(
      deriveInstallationConfigEntries({
        appType: 'media-library',
        fields: [
          {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
          {name: 'language', src: './src/language.ts', title: 'Language'},
        ],
      }),
    ).toEqual([
      {name: 'description', src: './src/description.ts'},
      {name: 'language', src: './src/language.ts'},
    ])
  })

  test('an empty field set yields no entries', () => {
    expect(deriveInstallationConfigEntries({appType: 'media-library', fields: []})).toEqual([])
  })

  test('throws on an app type it cannot handle', () => {
    expect(() => deriveInstallationConfigEntries({appType: 'core-app', fields: []})).toThrow(
      /unknown installation config appType: core-app/i,
    )
  })
})
