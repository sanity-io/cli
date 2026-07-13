import {type ApplicationType} from '@sanity/cli-core'
import {describe, expect, expectTypeOf, test} from 'vitest'

import {
  DefineAppInputSchema,
  type DefineAppResult,
  type DockGroup,
  isWorkbenchApp,
  readConfig,
  unstable_defineApp,
  type WorkbenchApp,
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

  test('is recognised by `isWorkbenchApp` (Symbol.for brand contract)', () => {
    const app = unstable_defineApp({name: 'drop-desk', organizationId: 'org-1', title: 'Drop Desk'})
    expect(isWorkbenchApp(app)).toBe(true)
  })

  test("cli-core's `ApplicationType` mirror stays in sync with the schema enum", () => {
    // cli-core mirrors the list at config load (it can't depend on this package)
    expectTypeOf<
      Exclude<WorkbenchApp['applicationType'], undefined>
    >().toEqualTypeOf<ApplicationType>()
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
      applicationType: 'media-library',
      name: 'media',
      organizationId: 'org-1',
      title: 'Media',
    })
    expect(parsed.applicationType).toBe('media-library')
    expect(
      DefineAppInputSchema.safeParse({
        applicationType: 'not-a-type',
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

  test('accepts an config and isSingleton', () => {
    const parsed = DefineAppInputSchema.parse({
      config: {
        appType: 'media-library',
        fields: [
          {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
        ],
      },
      isSingleton: true,
      name: 'media-library',
      organizationId: 'org-1',
      title: 'Media Library',
    })
    expect(parsed.isSingleton).toBe(true)
    expect(parsed.config).toEqual({
      appType: 'media-library',
      fields: [
        {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
      ],
    })
  })

  test('rejects an config on a non-singleton app', () => {
    const result = DefineAppInputSchema.safeParse({
      config: {
        appType: 'media-library',
        fields: [{name: 'description', src: './src/description.ts', title: 'Description'}],
      },
      name: 'media-library',
      organizationId: 'org-1',
      title: 'Media Library',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.some((issue) => /singleton/.test(issue.message))).toBe(true)
  })

  test('rejects an config without fields', () => {
    expect(
      DefineAppInputSchema.safeParse({
        config: {appType: 'media-library'},
        name: 'media-library',
        organizationId: 'org-1',
        title: 'Media Library',
      }).success,
    ).toBe(false)
  })

  test('rejects duplicate field names within an config', () => {
    const dupes = DefineAppInputSchema.safeParse({
      config: {
        appType: 'media-library',
        fields: [
          {name: 'description', src: './src/a.ts', title: 'A'},
          {name: 'description', src: './src/b.ts', title: 'B'},
        ],
      },
      name: 'media-library',
      organizationId: 'org-1',
      title: 'Media Library',
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

  test('accepts `slug` for an SDK app', () => {
    const parsed = DefineAppInputSchema.parse({
      name: 'drop-desk',
      organizationId: 'org-1',
      slug: 'drop-desk',
      title: 'Drop',
    })
    expect(parsed.slug).toBe('drop-desk')
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

  test('does not expose the internal applicationType, isSingleton, or config', () => {
    expectTypeOf<DefineAppResult>().not.toHaveProperty('applicationType')
    expectTypeOf<DefineAppResult>().not.toHaveProperty('isSingleton')
    expectTypeOf<DefineAppResult>().not.toHaveProperty('config')
  })
})

describe('readConfig', () => {
  const config = {
    appType: 'media-library',
    fields: [{name: 'description', src: './src/description.ts', title: 'Description'}],
  }

  test('returns the config for a singleton', () => {
    const app = {config: config, isSingleton: true} as unknown as WorkbenchApp
    expect(readConfig(app)).toBe(config)
  })

  test('returns undefined when the app declares none', () => {
    expect(readConfig({isSingleton: true} as unknown as WorkbenchApp)).toBeUndefined()
  })

  test('throws when a non-singleton declares a config', () => {
    const app = {config: config} as unknown as WorkbenchApp
    expect(() => readConfig(app)).toThrow(/only supported for singleton apps/)
  })
})
