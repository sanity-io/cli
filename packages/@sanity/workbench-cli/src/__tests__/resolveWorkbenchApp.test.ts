import {type CliConfig} from '@sanity/cli-core'
import {describe, expect, test} from 'vitest'

import {unstable_defineApp, unstable_defineMediaLibrary} from '../defineApp.js'
import {resolveWorkbenchApp} from '../resolveWorkbenchApp.js'

const asConfig = (app: unknown) => ({app}) as CliConfig

describe('resolveWorkbenchApp', () => {
  test.each([
    ['a null config', null],
    ['an undefined config', undefined],
    ['a config without an app', {} as CliConfig],
    ['a plain (unbranded) app', asConfig({name: 'plain', organizationId: 'org', title: 'Plain'})],
  ])('returns null for %s', (_label, config) => {
    expect(resolveWorkbenchApp(config as CliConfig | null | undefined)).toBeNull()
  })

  test('resolves a branded app with defaulted views/services and no singleton flag', () => {
    const config = asConfig(
      unstable_defineApp({name: 'my-app', organizationId: 'org-123', title: 'My App'}),
    )

    expect(resolveWorkbenchApp(config)).toEqual({
      applicationType: undefined,
      config: undefined,
      entry: undefined,
      group: undefined,
      isSingleton: undefined,
      name: 'my-app',
      priority: undefined,
      services: [],
      views: [],
    })
  })

  test('passes through declared views, services, entry, slug, visibility, and dock placement', () => {
    const config = asConfig(
      unstable_defineApp({
        entry: './src/App.tsx',
        group: 'dock.system',
        name: 'my-app',
        organizationId: 'org-123',
        priority: 20,
        services: [{name: 'worker', src: './src/worker.ts', type: 'worker'}],
        slug: 'my-app-host',
        title: 'My App',
        views: [{name: 'feed', src: './src/Feed.tsx', type: 'panel'}],
        visibility: 'unlisted',
      }),
    )

    const resolved = resolveWorkbenchApp(config)
    expect(resolved).toMatchObject({
      entry: './src/App.tsx',
      group: 'dock.system',
      priority: 20,
      services: [{name: 'worker', src: './src/worker.ts', type: 'worker'}],
      slug: 'my-app-host',
      views: [{name: 'feed', src: './src/Feed.tsx', type: 'panel'}],
      visibility: 'unlisted',
    })
  })

  test('resolves a media library singleton and its config', () => {
    const config = asConfig(
      unstable_defineMediaLibrary({
        fields: [{name: 'rights', src: './src/rights.ts', title: 'Rights'}],
        organizationId: 'org-123',
      }),
    )

    const resolved = resolveWorkbenchApp(config)
    expect(resolved).toMatchObject({
      isSingleton: true,
      name: 'media-library',
    })
    expect(resolved!.config).toEqual({
      appType: 'media-library',
      fields: [{name: 'rights', src: './src/rights.ts', title: 'Rights'}],
    })
  })

  test('throws when a non-singleton declares an config', () => {
    const config = asConfig(
      unstable_defineApp({
        // @ts-expect-error -- config is internal; forcing the invalid combination
        config: {appType: 'media-library', fields: []},
        name: 'my-app',
        organizationId: 'org-123',
        title: 'My App',
      }),
    )

    expect(() => resolveWorkbenchApp(config)).toThrow(
      '`config` is only supported for singleton apps',
    )
  })
})
