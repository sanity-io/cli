import {type CliConfig} from '@sanity/cli-core'
import {describe, expect, test} from 'vitest'

import {defineApplication, unstable_defineMediaLibrary} from '../defineApp.js'
import {resolveWorkbenchApp} from '../resolveWorkbenchApp.js'

const asConfig = (app: unknown) => ({app}) as CliConfig

describe('resolveWorkbenchApp', () => {
  test.each([
    ['a null config', null],
    ['an undefined config', undefined],
    ['a config without an app', {} as CliConfig],
    ['a plain (unbranded) app', asConfig({name: 'plain', organizationId: 'org', title: 'Plain'})],
    // A media library is a config, not an app — it resolves through
    // `resolveWorkbenchConfig`, so `resolveWorkbenchApp` returns null like a project.
    ['a media library config', asConfig(unstable_defineMediaLibrary({organizationId: 'org'}))],
  ])('returns null for %s', (_label, config) => {
    expect(resolveWorkbenchApp(config as CliConfig | null | undefined)).toBeNull()
  })

  test('resolves a branded app with defaulted views/services', () => {
    const config = asConfig(
      defineApplication({
        organizationId: 'org-123',
        slug: 'my-app',
        title: 'My App',
      }),
    )

    expect(resolveWorkbenchApp(config)).toEqual({
      applicationType: undefined,
      entry: undefined,
      // Identity defaults to the slug when no explicit name is declared.
      name: 'my-app',
      organizationId: 'org-123',
      services: [],
      slug: 'my-app',
      views: [],
    })
  })

  test('keeps an explicit name distinct from the slug', () => {
    const config = asConfig(
      defineApplication({
        name: 'reviews',
        organizationId: 'org-123',
        slug: 'reviews-app',
        title: 'Reviews',
      }),
    )

    expect(resolveWorkbenchApp(config)).toMatchObject({name: 'reviews', slug: 'reviews-app'})
  })

  test('passes through a declared app entry, services, slug, and visibility', () => {
    const config = asConfig(
      defineApplication({
        entry: './src/App.tsx',
        organizationId: 'org-123',
        services: [{name: 'worker', src: './src/worker.ts', title: 'worker', type: 'worker'}],
        slug: 'my-app-host',
        title: 'My App',
        visibility: 'unlisted',
      }),
    )

    expect(resolveWorkbenchApp(config)).toMatchObject({
      entry: './src/App.tsx',
      services: [{name: 'worker', src: './src/worker.ts', title: 'worker', type: 'worker'}],
      slug: 'my-app-host',
      visibility: 'unlisted',
    })
  })

  test('passes through declared panel views and services', () => {
    const config = asConfig(
      defineApplication({
        organizationId: 'org-123',
        services: [{name: 'worker', src: './src/worker.ts', title: 'worker', type: 'worker'}],
        slug: 'my-app-host',
        title: 'My App',
        views: [{name: 'feed', src: './src/Feed.tsx', title: 'feed', type: 'panel'}],
      }),
    )

    expect(resolveWorkbenchApp(config)).toMatchObject({
      services: [{name: 'worker', src: './src/worker.ts', title: 'worker', type: 'worker'}],
      views: [{name: 'feed', src: './src/Feed.tsx', title: 'feed', type: 'panel'}],
    })
  })

  test('resolves an app entry and panel views together', () => {
    const config = asConfig(
      defineApplication({
        entry: './src/App.tsx',
        organizationId: 'org-123',
        slug: 'my-app',
        title: 'My App',
        views: [{name: 'feed', src: './src/Feed.tsx', title: 'feed', type: 'panel'}],
      }),
    )

    expect(resolveWorkbenchApp(config)).toMatchObject({
      entry: './src/App.tsx',
      views: [{name: 'feed', src: './src/Feed.tsx', title: 'feed', type: 'panel'}],
    })
  })
})
