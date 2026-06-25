import {type CliConfig, isWorkbenchApp} from '@sanity/cli-core'
import {describe, expect, expectTypeOf, test} from 'vitest'

import {
  DefineAppInputSchema,
  type DefineAppResult,
  type DockGroup,
  unstable_defineApp,
} from '../defineApp.js'

// The brand is a global-registry symbol; re-derive it the way the CLI loader
// (`@sanity/cli-core`) does, rather than reaching for a module-private const.
const WORKBENCH_APP = Symbol.for('sanity.workbench.defineApp')

describe('unstable_defineApp', () => {
  test('is identity at runtime — returns the same object reference', () => {
    const input = {name: 'drop-desk', organizationId: 'org-1', title: 'Drop Desk'}
    expect(unstable_defineApp(input)).toBe(input)
  })

  test('brands the result so the CLI can discriminate it', () => {
    const app = unstable_defineApp({name: 'drop-desk', organizationId: 'org-1', title: 'Drop Desk'})
    expect(Object.getOwnPropertyDescriptor(app, WORKBENCH_APP)?.value).toBe(true)
  })

  test('leaves the brand non-enumerable so it does not leak into config spreads', () => {
    const app = unstable_defineApp({name: 'drop-desk', organizationId: 'org-1', title: 'Drop Desk'})
    expect(Object.keys(app)).toEqual(['name', 'organizationId', 'title'])
    expect(Object.getOwnPropertySymbols({...app})).not.toContain(WORKBENCH_APP)
  })

  test('preserves declared fields', () => {
    const app = unstable_defineApp({
      icon: './icon.svg',
      name: 'athlete-desk',
      organizationId: 'org-1',
      title: 'Athlete Desk',
    })
    expect(app.name).toBe('athlete-desk')
    expect(app.title).toBe('Athlete Desk')
    expect(app.icon).toBe('./icon.svg')
  })

  test('is recognised by `@sanity/cli-core`s `isWorkbenchApp` (shared Symbol.for contract)', () => {
    const app = unstable_defineApp({name: 'drop-desk', organizationId: 'org-1', title: 'Drop Desk'})
    // The whole point of branding via `Symbol.for`: cli-core re-derives the same
    // global symbol and discriminates on it without importing this module.
    expect(isWorkbenchApp(app as CliConfig['app'])).toBe(true)
  })
})

describe('DefineAppInputSchema (build-time validation)', () => {
  test('accepts a valid name', () => {
    const parsed = DefineAppInputSchema.parse({
      name: 'drop_desk-1',
      organizationId: 'org-1',
      title: 'Drop',
    })
    expect(parsed.name).toBe('drop_desk-1')
  })

  test('rejects a name with illegal characters', () => {
    const result = DefineAppInputSchema.safeParse({
      name: 'drop desk!',
      organizationId: 'org-1',
      title: 'Drop',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/must match/)
  })

  test('requires a title', () => {
    expect(
      DefineAppInputSchema.safeParse({name: 'drop-desk', organizationId: 'org-1'}).success,
    ).toBe(false)
  })

  test('requires an organizationId with a pointed error', () => {
    const result = DefineAppInputSchema.safeParse({name: 'drop-desk', title: 'Drop'})
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/organizationId.*required/)
  })

  test('validates the internal applicationType when present', () => {
    const parsed = DefineAppInputSchema.parse({
      applicationType: 'canvas',
      name: 'media',
      organizationId: 'org-1',
      title: 'Media',
    })
    expect(parsed.applicationType).toBe('canvas')
    expect(
      DefineAppInputSchema.safeParse({
        applicationType: 'not-a-type',
        name: 'media',
        organizationId: 'org-1',
        title: 'Media',
      }).success,
    ).toBe(false)
  })

  test('validates the internal isSingleton when present', () => {
    const parsed = DefineAppInputSchema.parse({
      isSingleton: true,
      name: 'media',
      organizationId: 'org-1',
      title: 'Media',
    })
    expect(parsed.isSingleton).toBe(true)
    expect(
      DefineAppInputSchema.safeParse({
        isSingleton: 'yes',
        name: 'media',
        organizationId: 'org-1',
        title: 'Media',
      }).success,
    ).toBe(false)
  })

  test('accepts group and priority, rejecting an unknown group', () => {
    const parsed = DefineAppInputSchema.parse({
      group: 'dock.system',
      name: 'drop-desk',
      organizationId: 'org-1',
      priority: 20,
      title: 'Drop',
    })
    expect(parsed.group).toBe('dock.system')
    expect(parsed.priority).toBe(20)
    expect(
      DefineAppInputSchema.safeParse({
        group: 'dock.nope',
        name: 'drop-desk',
        organizationId: 'org-1',
        title: 'Drop',
      }).success,
    ).toBe(false)
  })

  test('accepts a panel view declaration', () => {
    const parsed = DefineAppInputSchema.parse({
      name: 'drop-desk',
      organizationId: 'org-1',
      title: 'Drop',
      views: [{name: 'feed', src: './src/panel.tsx', type: 'panel'}],
    })
    expect(parsed.views?.[0]).toEqual({name: 'feed', src: './src/panel.tsx', type: 'panel'})
  })

  test('rejects an unknown view type', () => {
    expect(
      DefineAppInputSchema.safeParse({
        name: 'drop-desk',
        organizationId: 'org-1',
        title: 'Drop',
        views: [{name: 'feed', src: './src/panel.tsx', type: 'sidebar'}],
      }).success,
    ).toBe(false)
  })

  test('rejects duplicate view names within an app', () => {
    const result = DefineAppInputSchema.safeParse({
      name: 'drop-desk',
      organizationId: 'org-1',
      title: 'Drop',
      views: [
        {name: 'feed', src: './src/a.tsx', type: 'panel'},
        {name: 'feed', src: './src/b.tsx', type: 'panel'},
      ],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/unique/)
  })

  test('accepts a worker service declaration, rejecting duplicate service names', () => {
    expect(
      DefineAppInputSchema.safeParse({
        name: 'drop-desk',
        organizationId: 'org-1',
        services: [{name: 'unread', src: './src/service.ts', type: 'worker'}],
        title: 'Drop',
      }).success,
    ).toBe(true)
    const dupes = DefineAppInputSchema.safeParse({
      name: 'drop-desk',
      organizationId: 'org-1',
      services: [
        {name: 'unread', src: './src/a.ts', type: 'worker'},
        {name: 'unread', src: './src/b.ts', type: 'worker'},
      ],
      title: 'Drop',
    })
    expect(dupes.success).toBe(false)
    expect(dupes.error?.issues[0]?.message).toMatch(/unique/)
  })

  test('rejects `entry` on a studio with a not-yet-implemented error', () => {
    const result = DefineAppInputSchema.safeParse({
      applicationType: 'studio',
      entry: './src/App.tsx',
      name: 'fernway',
      organizationId: 'org-1',
      title: 'Fernway',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/not implemented yet/)
    expect(result.error?.issues[0]?.path).toEqual(['entry'])
  })

  test('accepts `entry` for an SDK app (no applicationType / coreApp)', () => {
    expect(
      DefineAppInputSchema.safeParse({
        entry: './src/App.tsx',
        name: 'drop-desk',
        organizationId: 'org-1',
        title: 'Drop',
      }).success,
    ).toBe(true)
    expect(
      DefineAppInputSchema.safeParse({
        applicationType: 'coreApp',
        entry: './src/App.tsx',
        name: 'drop-desk',
        organizationId: 'org-1',
        title: 'Drop',
      }).success,
    ).toBe(true)
  })
})

describe('type surface', () => {
  test('exposes title/icon/entry/organizationId/group/priority', () => {
    expectTypeOf<DefineAppResult['name']>().toEqualTypeOf<string>()
    expectTypeOf<DefineAppResult['title']>().toEqualTypeOf<string>()
    expectTypeOf<DefineAppResult['icon']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<DefineAppResult['entry']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<DefineAppResult['organizationId']>().toEqualTypeOf<string>()
    expectTypeOf<DefineAppResult['group']>().toEqualTypeOf<DockGroup | undefined>()
    expectTypeOf<DefineAppResult['priority']>().toEqualTypeOf<number | undefined>()
  })

  test('does not expose the internal applicationType', () => {
    expectTypeOf<DefineAppResult>().not.toHaveProperty('applicationType')
  })

  test('does not expose the internal isSingleton', () => {
    expectTypeOf<DefineAppResult>().not.toHaveProperty('isSingleton')
  })
})
