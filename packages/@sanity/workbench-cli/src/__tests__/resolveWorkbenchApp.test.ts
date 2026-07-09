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
      entry: undefined,
      installationConfig: undefined,
      isSingleton: undefined,
      name: 'my-app',
      services: [],
      views: [],
    })
  })

  test('passes through declared views, services, and entry', () => {
    const config = asConfig(
      unstable_defineApp({
        entry: './src/App.tsx',
        name: 'my-app',
        organizationId: 'org-123',
        services: [{name: 'worker', src: './src/worker.ts', type: 'worker'}],
        title: 'My App',
        views: [{name: 'feed', src: './src/Feed.tsx', type: 'panel'}],
      }),
    )

    const resolved = resolveWorkbenchApp(config)
    expect(resolved).toMatchObject({
      entry: './src/App.tsx',
      services: [{name: 'worker', src: './src/worker.ts', type: 'worker'}],
      views: [{name: 'feed', src: './src/Feed.tsx', type: 'panel'}],
    })
  })

  test('resolves a media library singleton and its installation config', () => {
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
    expect(resolved!.installationConfig).toEqual({
      appType: 'media-library',
      fields: [{name: 'rights', src: './src/rights.ts', title: 'Rights'}],
    })
  })

  test('throws when a non-singleton declares an installation config', () => {
    const config = asConfig(
      unstable_defineApp({
        // @ts-expect-error -- installationConfig is internal; forcing the invalid combination
        installationConfig: {appType: 'media-library', fields: []},
        name: 'my-app',
        organizationId: 'org-123',
        title: 'My App',
      }),
    )

    expect(() => resolveWorkbenchApp(config)).toThrow(
      '`installationConfig` is only supported for singleton apps',
    )
  })
})
