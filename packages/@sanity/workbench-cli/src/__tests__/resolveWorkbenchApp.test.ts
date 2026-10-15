import {type CliConfig} from '@sanity/cli-core'
import {describe, expect, test} from 'vitest'

import {definePanelView, defineWindowView} from '../contract.js'
import {defineApplication, unstable_defineMediaLibrary} from '../defineApp.js'
import {resolveAppEntry, resolveWorkbenchApp} from '../resolveWorkbenchApp.js'

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

  test('resolves a branded app with defaulted views and web workers', () => {
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
      slug: 'my-app',
      views: [],
      webWorkers: [],
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

  test('passes through a declared app entry, web workers, slug, and visibility', () => {
    const config = asConfig(
      defineApplication({
        entry: './src/App.tsx',
        organizationId: 'org-123',
        slug: 'my-app-host',
        title: 'My App',
        visibility: 'unlisted',
        webWorkers: [{name: 'worker', src: './src/worker.ts', title: 'worker', type: 'worker'}],
      }),
    )

    expect(resolveWorkbenchApp(config)).toMatchObject({
      entry: './src/App.tsx',
      slug: 'my-app-host',
      visibility: 'unlisted',
      webWorkers: [{name: 'worker', src: './src/worker.ts', title: 'worker', type: 'worker'}],
    })
  })

  test('passes through declared panel views and web workers', () => {
    const config = asConfig(
      defineApplication({
        organizationId: 'org-123',
        slug: 'my-app-host',
        title: 'My App',
        views: [{name: 'feed', src: './src/Feed.tsx', surface: 'panel', title: 'feed'}],
        webWorkers: [{name: 'worker', src: './src/worker.ts', title: 'worker', type: 'worker'}],
      }),
    )

    expect(resolveWorkbenchApp(config)).toMatchObject({
      views: [{name: 'feed', src: './src/Feed.tsx', surface: 'panel', title: 'feed'}],
      webWorkers: [{name: 'worker', src: './src/worker.ts', title: 'worker', type: 'worker'}],
    })
  })

  test('resolves an app entry and panel views together', () => {
    const config = asConfig(
      defineApplication({
        entry: './src/App.tsx',
        organizationId: 'org-123',
        slug: 'my-app',
        title: 'My App',
        views: [{name: 'feed', src: './src/Feed.tsx', surface: 'panel', title: 'feed'}],
      }),
    )

    expect(resolveWorkbenchApp(config)).toMatchObject({
      entry: './src/App.tsx',
      views: [{name: 'feed', src: './src/Feed.tsx', surface: 'panel', title: 'feed'}],
    })
  })
})

const app = (input: Partial<Parameters<typeof defineApplication>[0]>) =>
  defineApplication({organizationId: 'org', slug: 'my-app', title: 'My App', ...input})
const panel = definePanelView({name: 'feed', src: './src/Feed.tsx', title: 'Feed'})
const windowView = defineWindowView({name: 'main', src: './src/Main.tsx', title: 'Main'})

describe('resolveAppEntry', () => {
  test.each([
    [
      'entry ahead of window views',
      app({entry: './src/App.tsx', views: [windowView]}),
      './src/App.tsx',
    ],
    ['a window view without entry', app({views: [panel, windowView]}), './src/Main.tsx'],
    ['nothing for a dock-only app', app({views: [panel]}), undefined],
    ['a plain app entry', {entry: './src/Plain.tsx'}, './src/Plain.tsx'],
  ])('resolves %s', (_label, input, expected) => {
    expect(resolveAppEntry(input as CliConfig['app'])).toBe(expected)
  })
})
