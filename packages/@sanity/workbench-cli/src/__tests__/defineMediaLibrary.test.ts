import {describe, expect, expectTypeOf, test} from 'vitest'

import {
  type DefineMediaLibraryInput,
  isWorkbenchApp,
  isWorkbenchConfig,
  unstable_defineMediaLibrary,
} from '../defineApp.js'

// A media library is a config, not an app — it carries the distinct config brand.
const WORKBENCH_CONFIG = Symbol.for('sanity.workbench.defineConfig')

describe('unstable_defineMediaLibrary', () => {
  test('brands the result with the config brand, not the app brand', () => {
    const app = unstable_defineMediaLibrary({organizationId: 'org-1'})
    expect(Object.getOwnPropertyDescriptor(app, WORKBENCH_CONFIG)?.value).toBe(true)
    expect(isWorkbenchConfig(app)).toBe(true)
    // A config is not an app — the two brands are severed.
    expect(isWorkbenchApp(app)).toBe(false)
  })

  test('declares a media-library config bound to its target by appType', () => {
    const app = unstable_defineMediaLibrary({organizationId: 'org-1'})
    expect(app.appType).toBe('media-library')
    expect(app.organizationId).toBe('org-1')
    // No app identity — a config carries no slug or title.
    expect(app).not.toHaveProperty('slug')
    expect(app).not.toHaveProperty('title')
  })

  test('collects all declared fields', () => {
    const app = unstable_defineMediaLibrary({
      fields: [
        {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
        {name: 'language', src: './src/language.ts', title: 'Language'},
      ],
      organizationId: 'org-1',
    })
    expect(app.fields).toEqual([
      {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
      {name: 'language', src: './src/language.ts', title: 'Language'},
    ])
  })

  test('defaults to no fields', () => {
    const app = unstable_defineMediaLibrary({organizationId: 'org-1'})
    expect(app.fields).toEqual([])
  })

  test('leaves the brand non-enumerable so it does not leak into config spreads', () => {
    const app = unstable_defineMediaLibrary({organizationId: 'org-1'})
    expect(Object.getOwnPropertySymbols({...app})).not.toContain(WORKBENCH_CONFIG)
  })
})

describe('type surface', () => {
  test('input takes organizationId and optional fields only', () => {
    expectTypeOf<DefineMediaLibraryInput['organizationId']>().toEqualTypeOf<string>()
    expectTypeOf<DefineMediaLibraryInput>().not.toHaveProperty('applicationType')
    expectTypeOf<DefineMediaLibraryInput>().not.toHaveProperty('views')
  })

  test('a field is a media-library config without the type tag', () => {
    expectTypeOf<NonNullable<DefineMediaLibraryInput['fields']>[number]>().not.toHaveProperty(
      'type',
    )
  })
})
