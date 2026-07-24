import {type CliConfig} from '@sanity/cli-core'
import {describe, expect, test} from 'vitest'

import {type DefineAppInput, unstable_defineApp, unstable_defineMediaLibrary} from '../defineApp.js'
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
      unstable_defineApp({
        name: 'my-app',
        organizationId: 'org-123',
        slug: 'my-app',
        title: 'My App',
      }),
    )

    expect(resolveWorkbenchApp(config)).toEqual({
      applicationType: undefined,
      config: undefined,
      entry: undefined,
      isSingleton: undefined,
      name: 'my-app',
      organizationId: 'org-123',
      services: [],
      slug: 'my-app',
      views: [],
    })
  })

  test('passes through a declared app entry, services, slug, and visibility', () => {
    const config = asConfig(
      unstable_defineApp({
        entry: './src/App.tsx',
        name: 'my-app',
        organizationId: 'org-123',
        services: [{name: 'worker', src: './src/worker.ts', type: 'worker'}],
        slug: 'my-app-host',
        title: 'My App',
        visibility: 'unlisted',
      }),
    )

    expect(resolveWorkbenchApp(config)).toMatchObject({
      entry: './src/App.tsx',
      services: [{name: 'worker', src: './src/worker.ts', type: 'worker'}],
      slug: 'my-app-host',
      visibility: 'unlisted',
    })
  })

  test('passes through declared panel views and services', () => {
    const config = asConfig(
      unstable_defineApp({
        name: 'my-app',
        organizationId: 'org-123',
        services: [{name: 'worker', src: './src/worker.ts', type: 'worker'}],
        slug: 'my-app-host',
        title: 'My App',
        views: [{name: 'feed', src: './src/Feed.tsx', type: 'panel'}],
      }),
    )

    expect(resolveWorkbenchApp(config)).toMatchObject({
      services: [{name: 'worker', src: './src/worker.ts', type: 'worker'}],
      views: [{name: 'feed', src: './src/Feed.tsx', type: 'panel'}],
    })
  })

  test('throws when an app declares both an entry and panel views', () => {
    const config = asConfig(
      unstable_defineApp({
        entry: './src/App.tsx',
        name: 'my-app',
        organizationId: 'org-123',
        title: 'My App',
        views: [{name: 'feed', src: './src/Feed.tsx', type: 'panel'}],
      } as unknown as DefineAppInput),
    )

    expect(() => resolveWorkbenchApp(config)).toThrow('cannot expose both an app view')
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
