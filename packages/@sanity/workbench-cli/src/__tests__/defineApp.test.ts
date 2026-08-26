import {type ApplicationType, type AppVisibility} from '@sanity/cli-core'
import {describe, expect, expectTypeOf, test} from 'vitest'

import {
  defineAssetSourceView,
  definePanelView,
  defineTileView,
  defineWebWorker,
  defineWindowView,
  type DockGroup,
} from '../contract.js'
import {
  type DefineAppInput,
  DefineAppInputSchema,
  defineApplication,
  type DefineAppResult,
  isWorkbenchApp,
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

describe('defineApplication', () => {
  test('is identity at runtime — returns the same object reference', () => {
    const input = {organizationId: 'org-1', slug: 'drop-desk', title: 'Drop Desk'}
    expect(defineApplication(input)).toBe(input)
  })

  test('brands the result so the CLI can discriminate it', () => {
    const app = defineApplication({organizationId: 'org-1', slug: 'drop-desk', title: 'Drop Desk'})
    expect(Object.getOwnPropertyDescriptor(app, WORKBENCH_APP)?.value).toBe(true)
  })

  test('leaves the brand non-enumerable so it does not leak into config spreads', () => {
    const app = defineApplication({organizationId: 'org-1', slug: 'drop-desk', title: 'Drop Desk'})
    expect(Object.keys(app)).toEqual(['organizationId', 'slug', 'title'])
    expect(Object.getOwnPropertySymbols({...app})).not.toContain(WORKBENCH_APP)
  })

  test('preserves declared fields', () => {
    const app = defineApplication({
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
    const app = defineApplication({organizationId: 'org-1', slug: 'drop-desk', title: 'Drop Desk'})
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

describe('view declaration helpers', () => {
  test('add the view surface', () => {
    expect(
      defineAssetSourceView({name: 'library', src: './src/Library.tsx', title: 'Library'}),
    ).toEqual({
      name: 'library',
      src: './src/Library.tsx',
      surface: 'asset_source',
      title: 'Library',
    })
    expect(defineWindowView({name: 'app', src: './src/App.tsx', title: 'App'})).toEqual({
      name: 'app',
      src: './src/App.tsx',
      surface: 'app',
      title: 'App',
    })
    expect(definePanelView({name: 'feed', src: './src/Feed.tsx', title: 'Feed'})).toEqual({
      name: 'feed',
      src: './src/Feed.tsx',
      surface: 'panel',
      title: 'Feed',
    })
    expect(
      defineTileView({name: 'agent', size: 'small', src: './src/Agent.tsx', title: 'Agent'}),
    ).toEqual({
      name: 'agent',
      size: 'small',
      src: './src/Agent.tsx',
      surface: 'tile',
      title: 'Agent',
    })
  })

  test('provide strict input types without accepting a surface', () => {
    defineAssetSourceView({
      name: 'library',
      src: './src/Library.tsx',
      // @ts-expect-error `surface` is added by the helper.
      surface: 'asset_source',
      title: 'Library',
    })
    defineWindowView({
      name: 'app',
      src: './src/App.tsx',
      // @ts-expect-error `surface` is added by the helper.
      surface: 'app',
      title: 'App',
    })
    definePanelView({
      name: 'feed',
      // @ts-expect-error `size` is only supported by tile views.
      size: 'small',
      src: './src/Feed.tsx',
      title: 'Feed',
    })
    // @ts-expect-error `size` is required for tile views.
    defineTileView({
      name: 'agent',
      src: './src/Agent.tsx',
      title: 'Agent',
    })
  })

  test('preserve panel and window placement metadata', () => {
    expect(
      defineWindowView({
        dock: {group: 'dock.applications', order: 10},
        name: 'app',
        src: './src/App.tsx',
        title: 'App',
      }),
    ).toMatchObject({dock: {group: 'dock.applications', order: 10}, surface: 'app'})
    expect(
      definePanelView({
        dock: {group: 'dock.user', order: 20},
        name: 'feed',
        src: './src/Feed.tsx',
        title: 'Feed',
      }),
    ).toMatchObject({dock: {group: 'dock.user', order: 20}, surface: 'panel'})
  })
})

describe('web worker declaration helper', () => {
  test('adds the worker type', () => {
    expect(defineWebWorker({name: 'unread', src: './src/unread.ts', title: 'Unread'})).toEqual({
      name: 'unread',
      src: './src/unread.ts',
      title: 'Unread',
      type: 'worker',
    })
  })

  test('provides strict input types without accepting a type', () => {
    defineWebWorker({
      name: 'unread',
      src: './src/unread.ts',
      title: 'Unread',
      // @ts-expect-error `type` is added by the helper.
      type: 'worker',
    })
    // @ts-expect-error `title` is required for web workers.
    defineWebWorker({name: 'unread', src: './src/unread.ts'})
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

  test('accepts an optional name distinct from the slug', () => {
    expect(DefineAppInputSchema.parse(validInput({name: 'reviews'})).name).toBe('reviews')
  })

  test('leaves name undefined when omitted (resolved to slug downstream)', () => {
    expect(DefineAppInputSchema.parse(validInput()).name).toBeUndefined()
  })

  test.each(['Reviews', 'sanity/media-library', 'has space', '-leading', 'trailing-'])(
    'rejects the name %j — it shares the slug grammar',
    (name) => {
      const result = DefineAppInputSchema.safeParse(validInput({name}))
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.message).toMatch(/name.*must be lowercase/)
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

  test('accepts dock defaults, rejecting an unknown group', () => {
    const parsed = DefineAppInputSchema.parse(validInput({dock: {group: 'dock.system', order: 20}}))
    expect(parsed.dock).toEqual({group: 'dock.system', order: 20})
    expect(DefineAppInputSchema.safeParse(validInput({dock: {}})).success).toBe(true)
    expect(DefineAppInputSchema.safeParse(validInput({dock: {group: 'nope'}})).success).toBe(false)
  })

  test('accepts a valid visibility, rejecting an out-of-set value', () => {
    expect(DefineAppInputSchema.parse(validInput({visibility: 'unlisted'})).visibility).toBe(
      'unlisted',
    )
    expect(DefineAppInputSchema.safeParse(validInput({visibility: 'hidden'})).success).toBe(false)
  })

  test('accepts a panel view declaration', () => {
    const parsed = DefineAppInputSchema.parse(
      validInput({
        views: [{name: 'feed', src: './src/panel.tsx', surface: 'panel', title: 'feed'}],
      }),
    )
    expect(parsed.views?.[0]).toEqual({
      name: 'feed',
      src: './src/panel.tsx',
      surface: 'panel',
      title: 'feed',
    })
  })

  test('accepts a window view declaration', () => {
    const parsed = DefineAppInputSchema.parse(
      validInput({
        views: [defineWindowView({name: 'app', src: './src/App.tsx', title: 'App'})],
      }),
    )
    expect(parsed.views?.[0]).toEqual({
      name: 'app',
      src: './src/App.tsx',
      surface: 'app',
      title: 'App',
    })
  })

  test('accepts multiple window views alongside the entry shortcut', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({
        entry: './src/Legacy.tsx',
        views: [
          defineWindowView({name: 'main', src: './src/Main.tsx', title: 'Main'}),
          defineWindowView({name: 'settings', src: './src/Settings.tsx', title: 'Settings'}),
        ],
      }),
    )
    expect(result.success).toBe(true)
  })

  test('requires a view title, which Brett stores on the interface', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({views: [{name: 'feed', src: './src/panel.tsx', surface: 'panel'}]}),
    )
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('View `title` is required')
  })

  test('accepts an asset_source view declaration', () => {
    const parsed = DefineAppInputSchema.parse(
      validInput({
        views: [
          {name: 'library', src: './src/picker.tsx', surface: 'asset_source', title: 'Library'},
        ],
      }),
    )
    expect(parsed.views?.[0]).toEqual({
      name: 'library',
      src: './src/picker.tsx',
      surface: 'asset_source',
      title: 'Library',
    })
  })

  test('rejects an unknown view surface', () => {
    expect(
      DefineAppInputSchema.safeParse(
        validInput({views: [{name: 'feed', src: './src/panel.tsx', surface: 'sidebar'}]}),
      ).success,
    ).toBe(false)
  })

  test('rejects duplicate view names within an app', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({
        views: [
          {name: 'feed', src: './src/a.tsx', surface: 'panel', title: 'feed'},
          {name: 'feed', src: './src/b.tsx', surface: 'panel', title: 'feed'},
        ],
      }),
    )
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/unique/)
  })

  test('accepts a web worker declaration, rejecting duplicate names', () => {
    expect(
      DefineAppInputSchema.safeParse(
        validInput({
          webWorkers: [{name: 'unread', src: './src/service.ts', title: 'unread', type: 'worker'}],
        }),
      ).success,
    ).toBe(true)
    const dupes = DefineAppInputSchema.safeParse(
      validInput({
        webWorkers: [
          {name: 'unread', src: './src/a.ts', title: 'unread', type: 'worker'},
          {name: 'unread', src: './src/b.ts', title: 'unread', type: 'worker'},
        ],
      }),
    )
    expect(dupes.success).toBe(false)
    expect(dupes.error?.issues[0]?.message).toMatch(/unique/)
  })

  test('accepts declaring both an entry and panel views', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({
        entry: './src/App.tsx',
        views: [{name: 'feed', src: './src/panel.tsx', surface: 'panel', title: 'feed'}],
      }),
    )
    expect(result.success).toBe(true)
  })

  test('accepts multiple panel views', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({
        views: [
          {name: 'feed', src: './src/a.tsx', surface: 'panel', title: 'feed'},
          {name: 'inbox', src: './src/b.tsx', surface: 'panel', title: 'inbox'},
        ],
      }),
    )
    expect(result.success).toBe(true)
  })

  test('accepts an `entry` alongside an asset_source view', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({
        entry: './src/App.tsx',
        views: [
          {name: 'library', src: './src/picker.tsx', surface: 'asset_source', title: 'Library'},
        ],
      }),
    )
    expect(result.success).toBe(true)
  })

  test('accepts an asset_source view alongside a panel view', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({
        views: [
          {name: 'feed', src: './src/panel.tsx', surface: 'panel', title: 'feed'},
          {name: 'library', src: './src/picker.tsx', surface: 'asset_source', title: 'Library'},
        ],
      }),
    )
    expect(result.success).toBe(true)
  })

  test('accepts a tile view declaration with a footprint size and optional order', () => {
    const parsed = DefineAppInputSchema.parse(
      validInput({
        views: [
          {
            name: 'agent-widget',
            order: 100,
            size: 'large',
            src: './src/tile.tsx',
            surface: 'tile',
            title: 'Agent',
          },
        ],
      }),
    )
    expect(parsed.views?.[0]).toEqual({
      name: 'agent-widget',
      order: 100,
      size: 'large',
      src: './src/tile.tsx',
      surface: 'tile',
      title: 'Agent',
    })
  })

  test('requires a size on a tile view', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({
        views: [{name: 'agent-widget', src: './src/tile.tsx', surface: 'tile', title: 'Agent'}],
      }),
    )
    expect(result.success).toBe(false)
  })

  test('rejects an unknown tile size', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({
        views: [
          {
            name: 'agent-widget',
            size: 'huge',
            src: './src/tile.tsx',
            surface: 'tile',
            title: 'Agent',
          },
        ],
      }),
    )
    expect(result.success).toBe(false)
  })

  test('accepts an `entry` alongside a tile view', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({
        entry: './src/App.tsx',
        views: [
          {
            name: 'agent-widget',
            size: 'banner',
            src: './src/tile.tsx',
            surface: 'tile',
            title: 'Agent',
          },
        ],
      }),
    )
    expect(result.success).toBe(true)
  })

  test('accepts a tile view alongside a panel view', () => {
    const result = DefineAppInputSchema.safeParse(
      validInput({
        views: [
          {name: 'feed', src: './src/panel.tsx', surface: 'panel', title: 'feed'},
          {
            name: 'agent-widget',
            size: 'small',
            src: './src/tile.tsx',
            surface: 'tile',
            title: 'Agent',
          },
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
  test('exposes title/icon/entry/organizationId/dock', () => {
    expectTypeOf<DefineAppResult['slug']>().toEqualTypeOf<string>()
    expectTypeOf<DefineAppResult['title']>().toEqualTypeOf<string>()
    expectTypeOf<DefineAppResult['icon']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<DefineAppResult['entry']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<DefineAppResult['organizationId']>().toEqualTypeOf<string>()
    expectTypeOf<DefineAppResult['dock']>().toEqualTypeOf<
      {group?: DockGroup; order?: number} | undefined
    >()
  })

  test('does not expose the internal applicationType', () => {
    expectTypeOf<DefineAppResult>().not.toHaveProperty('applicationType')
  })
})

describe('interface surface', () => {
  type Base = {organizationId: string; slug: string; title: string}
  type PanelView = {name: string; src: string; surface: 'panel'; title: string}

  test('allows an app entry without panel views', () => {
    expectTypeOf<Base & {entry: string}>().toExtend<DefineAppInput>()
  })

  test('allows panel views without an app entry', () => {
    expectTypeOf<Base & {views: PanelView[]}>().toExtend<DefineAppInput>()
  })

  test('allows declaring an app entry and panel views together', () => {
    expectTypeOf<Base & {entry: string; views: PanelView[]}>().toExtend<DefineAppInput>()
  })
})
