import {describe, expect, expectTypeOf, test} from 'vitest'

import {
  type DefineMediaLibraryInput,
  isWorkbenchApp,
  unstable_defineMediaLibrary,
  type WorkbenchApp,
} from '../defineApp.js'

// Same global-registry brand `unstable_defineApp` stamps — a media library is a
// workbench app, so the CLI discriminates it the same way.
const WORKBENCH_APP = Symbol.for('sanity.workbench.defineApp')

// The public result type hides the fields a media library stamps
// (installationConfig, applicationType); narrow past it via the runtime guard.
function mediaLibrary(input: DefineMediaLibraryInput): WorkbenchApp {
  const app = unstable_defineMediaLibrary(input)
  if (!isWorkbenchApp(app)) throw new Error('expected a workbench app')
  return app
}

describe('unstable_defineMediaLibrary', () => {
  test('brands the result with the shared workbench brand', () => {
    const app = unstable_defineMediaLibrary({organizationId: 'org-1'})
    expect(Object.getOwnPropertyDescriptor(app, WORKBENCH_APP)?.value).toBe(true)
    expect(isWorkbenchApp(app)).toBe(true)
  })

  test('declares a media-library singleton with a stable name', () => {
    const app = mediaLibrary({organizationId: 'org-1'})
    expect(app.applicationType).toBe('media-library')
    expect(app.isSingleton).toBe(true)
    expect(app.name).toBe('media-library')
  })

  test('collects all fields into one installation config', () => {
    const app = mediaLibrary({
      fields: [
        {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
        {name: 'language', src: './src/language.ts', title: 'Language'},
      ],
      organizationId: 'org-1',
    })
    expect(app.installationConfig).toEqual({
      appType: 'media-library',
      fields: [
        {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
        {name: 'language', src: './src/language.ts', title: 'Language'},
      ],
    })
  })

  test('declares no config when no fields are given', () => {
    const app = mediaLibrary({organizationId: 'org-1'})
    expect(app.installationConfig).toBeUndefined()
  })

  test('leaves the brand non-enumerable so it does not leak into config spreads', () => {
    const app = unstable_defineMediaLibrary({organizationId: 'org-1'})
    expect(Object.getOwnPropertySymbols({...app})).not.toContain(WORKBENCH_APP)
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
