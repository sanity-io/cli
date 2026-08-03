import {type ApplicationType, type AppVisibility} from '@sanity/cli-core'
import {describe, expect, expectTypeOf, test} from 'vitest'

import {
  type DefineAppInput,
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

/**
 * A minimal valid `DefineAppInputSchema` input. Spread overrides to vary a field;
 * `delete` one to assert it's required. A new required field only needs adding here.
 */
const validInput = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  organizationId: 'org-1',
  slug: 'drop-desk',
  title: 'Drop',
  ...overrides,
})

describe('unstable_defineApp', () => {
  test('is identity at runtime — returns the same object reference', () => {
    const input = {organizationId: 'org-1', slug: 'drop-desk', title: 'Drop Desk'}
    expect(unstable_defineApp(input)).toBe(input)
  })

  test('brands the result so the CLI can discriminate it', () => {
    const app = unstable_defineApp({organizationId: 'org-1', slug: 'drop-desk', title: 'Drop Desk'})
    expect(Object.getOwnPropertyDescriptor(app, WORKBENCH_APP)?.value).toBe(true)
  })

  test('leaves the brand non-enumerable so it does not leak into config spreads', () => {
    const app = unstable_defineApp({organizationId: 'org-1', slug: 'drop-desk', title: 'Drop Desk'})
    expect(Object.keys(app)).toEqual(['organizationId', 'slug', 'title'])
    expect(Object.getOwnPropertySymbols({...app})).not.toContain(WORKBENCH_APP)
  })

  test('preserves declared fields', () => {
    const app = unstable_defineApp({
      icon: './icon.svg',
      organizationId: 'org-1',
      slug: 'athlete-desk',
      title: 'Athlete Desk',
    })
    expect(app.slug).toBe('athlete-desk')
    expect(app.title).toBe('Athlete Desk')
    expect(app.icon).toBe('./icon.svg')
  })

  test('is recognised by `isWorkbenchApp` (Symbol.for brand contract)', () => {
    const app = unstable_defineApp({organizationId: 'org-1', slug: 'drop-desk', title: 'Drop Desk'})
    expect(isWorkbenchApp(app)).toBe(true)
  })

  test("cli-core's `ApplicationType` mirror stays in sync with the schema enum", () => {
    // cli-core mirrors the list at config load (it can't depend on this package)
    expectTypeOf<
      Exclude<WorkbenchApp['applicationType'], undefined>
    >().toEqualTypeOf<ApplicationType>()
  })

  test("cli-core's `AppVisibility` mirror stays in sync with the schema enum", () => {
    // The schema mirrors `APP_VISIBILITIES` locally to stay lean; this guards drift.
    expectTypeOf<Exclude<WorkbenchApp['visibility'], undefined>>().toEqualTypeOf<AppVisibility>()
  })
})

describe('DefineAppInputSchema (build-time validation)', () => {
  test('accepts a slug that is a valid DNS label', () => {
    expect(DefineAppInputSchema.parse(validInput({slug: 'drop-desk-1'})).slug).toBe('drop-desk-1')
  })

  test.each(['Drop-Desk', 'drop_desk', 'drop desk', '-drop-desk', 'drop-desk-'])(
    'rejects the slug %j — it would not survive as a hostname',
    (slug) => {
      const result = DefineAppInputSchema.safeParse(validInput({slug}))
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.message).toMatch(/must be lowercase/)
    },
  )

  test('requires a title', () => {
    const input = validInput()
    delete input.title
    expect(DefineAppInputSchema.safeParse(input).success).toBe(false)
  })

  test('requires an organizationId with a pointed error', () => {
    const input = validInput()
    delete input.organizationId
    const result = DefineAppInputSchema.safeParse(input)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/organizationId.*required/)
  })

  test('requires a slug with a pointed error', () => {
    const input = validInput()
    delete input.slug
    const result = DefineAppInputSchema.safeParse(input)
    expect(result.success).toBe(false)
    expect(result.error?.issues.some((issue) => /slug.*required/.test(issue.message))).toBe(true)
  })

  test('validates the internal applicationType when present', () => {
    expect(
      DefineAppInputSchema.parse(validInput({applicationType: 'canvas'})).applicationType,
    ).toBe('canvas')
    expect(
      DefineAppInputSchema.safeParse(validInput({applicationType: 'not-a-type'})).success,
    ).toBe(false)
  })

  test('accepts group and priority, rejecting an unknown group', () => {
    const parsed = DefineAppInputSchema.parse(validInput({group: 'dock.system', priority: 20}))
    expect(parsed.group).toBe('dock.system')
    expect(parsed.priority).toBe(20)
    expect(DefineAppInputSchema.safeParse(validInput({group: 'dock.nope'})).success).toBe(false)
  })

  test('accepts a valid visibility, rejecting an out-of-set value', () => {
    expect(DefineAppInputSchema.parse(validInput({visibility: 'unlisted'})).visibility).toBe(
      'unlisted',
    )
    expect(DefineAppInputSchema.safeParse(validInput({visibility: 'hidden'})).success).toBe(false)
  })

  test('accepts a panel view declaration', () => {
    const parsed = DefineAppInputSchema.parse(
      validInput({views: [{name: 'feed', src: './src/panel.tsx', title: 'feed', type: 'panel'}]}),
    )
    expect(parsed.views?.[0]).toEqual({
      name: 'feed',
      src: './src/panel.tsx',
      title: 'feed',
      type: 'panel',
    })
  })

  test('requires a view title, which Brett stores on the interface', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({views: [{name: 'feed', src: './src/panel.tsx', type: 'panel'}]}),
    )
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('View `title` is required')
  })

  test('accepts an asset_source view declaration', () => {
    const parsed = DefineAppInputSchema.parse(
      validInput({
        views: [{name: 'library', src: './src/picker.tsx', title: 'Library', type: 'asset_source'}],
      }),
    )
    expect(parsed.views?.[0]).toEqual({
      name: 'library',
      src: './src/picker.tsx',
      title: 'Library',
      type: 'asset_source',
    })
  })

  test('rejects an unknown view type', () => {
    expect(
      DefineAppInputSchema.safeParse(
        validInput({views: [{name: 'feed', src: './src/panel.tsx', type: 'sidebar'}]}),
      ).success,
    ).toBe(false)
  })

  test('rejects duplicate view names within an app', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({
        views: [
          {name: 'feed', src: './src/a.tsx', title: 'feed', type: 'panel'},
          {name: 'feed', src: './src/b.tsx', title: 'feed', type: 'panel'},
        ],
      }),
    )
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/unique/)
  })

  test('accepts a worker service declaration, rejecting duplicate service names', () => {
    expect(
      DefineAppInputSchema.safeParse(
        validInput({
          services: [{name: 'unread', src: './src/service.ts', title: 'unread', type: 'worker'}],
        }),
      ).success,
    ).toBe(true)
    const dupes = DefineAppInputSchema.safeParse(
      validInput({
        services: [
          {name: 'unread', src: './src/a.ts', title: 'unread', type: 'worker'},
          {name: 'unread', src: './src/b.ts', title: 'unread', type: 'worker'},
        ],
      }),
    )
    expect(dupes.success).toBe(false)
    expect(dupes.error?.issues[0]?.message).toMatch(/unique/)
  })

  test('accepts an config and isSingleton', () => {
    const parsed = DefineAppInputSchema.parse(
      validInput({
        config: {
          appType: 'media-library',
          fields: [
            {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
          ],
        },
        isSingleton: true,
      }),
    )
    expect(parsed.isSingleton).toBe(true)
    expect(parsed.config).toEqual({
      appType: 'media-library',
      fields: [
        {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
      ],
    })
  })

  test('rejects an config on a non-singleton app', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({
        config: {
          appType: 'media-library',
          fields: [{name: 'description', src: './src/description.ts', title: 'Description'}],
        },
      }),
    )
    expect(result.success).toBe(false)
    expect(result.error?.issues.some((issue) => /singleton/.test(issue.message))).toBe(true)
  })

  test('rejects an config without fields', () => {
    expect(
      DefineAppInputSchema.safeParse(validInput({config: {appType: 'media-library'}})).success,
    ).toBe(false)
  })

  test('rejects duplicate field names within an config', () => {
    const dupes = DefineAppInputSchema.safeParse(
      validInput({
        config: {
          appType: 'media-library',
          fields: [
            {name: 'description', src: './src/a.ts', title: 'A'},
            {name: 'description', src: './src/b.ts', title: 'B'},
          ],
        },
      }),
    )
    expect(dupes.success).toBe(false)
    expect(dupes.error?.issues[0]?.message).toMatch(/unique/)
  })

  test('rejects declaring both an entry and panel views', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({
        entry: './src/App.tsx',
        views: [{name: 'feed', src: './src/panel.tsx', title: 'feed', type: 'panel'}],
      }),
    )
    expect(result.success).toBe(false)
    expect(result.error?.issues.some((issue) => /cannot expose both/.test(issue.message))).toBe(
      true,
    )
  })

  test('rejects more than one panel view', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({
        views: [
          {name: 'feed', src: './src/a.tsx', title: 'feed', type: 'panel'},
          {name: 'inbox', src: './src/b.tsx', title: 'inbox', type: 'panel'},
        ],
      }),
    )
    expect(result.success).toBe(false)
    expect(result.error?.issues.some((issue) => /at most one panel view/.test(issue.message))).toBe(
      true,
    )
  })

  test('accepts an `entry` alongside an asset_source view', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({
        entry: './src/App.tsx',
        views: [{name: 'library', src: './src/picker.tsx', title: 'Library', type: 'asset_source'}],
      }),
    )
    expect(result.success).toBe(true)
  })

  test('does not count an asset_source view toward the one-panel cap', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({
        views: [
          {name: 'feed', src: './src/panel.tsx', title: 'feed', type: 'panel'},
          {name: 'library', src: './src/picker.tsx', title: 'Library', type: 'asset_source'},
        ],
      }),
    )
    expect(result.success).toBe(true)
  })

  test('rejects `entry` on a studio with a not-yet-implemented error', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({applicationType: 'studio', entry: './src/App.tsx'}),
    )
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/not implemented yet/)
    expect(result.error?.issues[0]?.path).toEqual(['entry'])
  })

  test('accepts `slug` for an SDK app', () => {
    expect(DefineAppInputSchema.parse(validInput()).slug).toBe('drop-desk')
  })

  test('accepts `entry` for an SDK app (no applicationType / coreApp)', () => {
    expect(DefineAppInputSchema.safeParse(validInput({entry: './src/App.tsx'})).success).toBe(true)
    expect(
      DefineAppInputSchema.safeParse(
        validInput({applicationType: 'coreApp', entry: './src/App.tsx'}),
      ).success,
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

describe('interface union (entry vs views)', () => {
  type Base = {name: string; organizationId: string; slug: string; title: string}
  type PanelView = {name: string; src: string; type: 'panel'}

  test('allows an app entry without panel views', () => {
    expectTypeOf<Base & {entry: string}>().toExtend<DefineAppInput>()
  })

  test('allows panel views without an app entry', () => {
    expectTypeOf<Base & {views: PanelView[]}>().toExtend<DefineAppInput>()
  })

  test('rejects declaring an app entry and panel views together', () => {
    expectTypeOf<Base & {entry: string; views: PanelView[]}>().not.toExtend<DefineAppInput>()
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
