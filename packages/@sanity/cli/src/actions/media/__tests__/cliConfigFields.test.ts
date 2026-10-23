import {describe, expect, test} from 'vitest'

import {appendFieldEntries, replaceFieldEntries} from '../cliConfigFields.js'

/** The shape `sanity init --template media-library-config` scaffolds. */
const SCAFFOLD = `import {defineCliConfig, unstable_defineMediaLibrary} from 'sanity/cli'

export default defineCliConfig({
  app: unstable_defineMediaLibrary({
    organizationId: 'org-1',
    fields: [
      {name: 'caption', src: './src/fields/caption.tsx', title: 'Caption'},
      {name: 'notes', src: './src/fields/notes.tsx', title: 'Notes'},
    ],
  }),
})
`

function unwrap(result: ReturnType<typeof appendFieldEntries>): string {
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`)
  return result.updated
}

describe('appendFieldEntries', () => {
  test('appends after the last entry of the scaffolded config', () => {
    const updated = unwrap(
      appendFieldEntries(SCAFFOLD, [
        `{name: 'credit', src: './src/fields/credit.ts', title: 'Credit'},`,
      ]),
    )

    expect(updated).toMatchInlineSnapshot(`
      "import {defineCliConfig, unstable_defineMediaLibrary} from 'sanity/cli'

      export default defineCliConfig({
        app: unstable_defineMediaLibrary({
          organizationId: 'org-1',
          fields: [
            {name: 'caption', src: './src/fields/caption.tsx', title: 'Caption'},
            {name: 'notes', src: './src/fields/notes.tsx', title: 'Notes'},
            {name: 'credit', src: './src/fields/credit.ts', title: 'Credit'},
          ],
        }),
      })
      "
    `)
  })

  test('fills an empty fields array', () => {
    const source = SCAFFOLD.replace(/fields: \[[^]*?\]/, 'fields: []')
    const updated = unwrap(
      appendFieldEntries(source, [
        `{name: 'credit', src: './src/fields/credit.ts', title: 'Credit'},`,
      ]),
    )

    expect(updated).toContain(
      `fields: [\n      {name: 'credit', src: './src/fields/credit.ts', title: 'Credit'},\n    ],`,
    )
  })

  test('adds the missing trailing comma to the previous last entry', () => {
    const source = SCAFFOLD.replace(
      `{name: 'notes', src: './src/fields/notes.tsx', title: 'Notes'},`,
      `{name: 'notes', src: './src/fields/notes.tsx', title: 'Notes'}`,
    )
    const updated = unwrap(
      appendFieldEntries(source, [
        `{name: 'credit', src: './src/fields/credit.ts', title: 'Credit'},`,
      ]),
    )

    expect(updated).toContain(
      `{name: 'notes', src: './src/fields/notes.tsx', title: 'Notes'},\n      {name: 'credit', src: './src/fields/credit.ts', title: 'Credit'},`,
    )
  })

  test('brackets inside strings and comments do not derail the scan', () => {
    const source = SCAFFOLD.replace(
      `title: 'Notes'},`,
      `title: 'Notes ][ tricky'}, // trailing ] comment\n      /* block ] comment */`,
    )
    const updated = unwrap(
      appendFieldEntries(source, [`{name: 'x', src: './src/fields/x.ts', title: 'X'},`]),
    )

    // Inserted after the last *entry* (not after the trailing comments, which
    // would put a sparse-array comma behind a comment), comments preserved.
    expect(updated).toContain(
      `tricky'},\n      {name: 'x', src: './src/fields/x.ts', title: 'X'}, // trailing ] comment`,
    )
    expect(updated).toContain('/* block ] comment */')
  })

  test('bails on a comment-only fields array rather than deleting the comment', () => {
    const source = SCAFFOLD.replace(
      /fields: \[[^]*?\]/,
      'fields: [\n      // add fields here\n    ]',
    )
    const result = appendFieldEntries(source, ['{}'])
    expect(result).toEqual({ok: false, reason: 'the `fields` array contains only comments'})
  })

  test('appends alongside a spread entry', () => {
    const source = SCAFFOLD.replace(/fields: \[[^]*?\]/, 'fields: [...sharedFields]')
    const updated = unwrap(
      appendFieldEntries(source, [`{name: 'x', src: './src/fields/x.ts', title: 'X'},`]),
    )

    expect(updated).toContain(
      `fields: [...sharedFields,\n      {name: 'x', src: './src/fields/x.ts', title: 'X'}`,
    )
  })

  test('template literals with ${...} holes are skipped correctly', () => {
    const source = SCAFFOLD.replace(`title: 'Notes'},`, 'title: `Notes ${["]"][0]} end`},')
    const updated = unwrap(
      appendFieldEntries(source, [`{name: 'x', src: './src/fields/x.ts', title: 'X'},`]),
    )

    expect(updated).toContain("end`},\n      {name: 'x'")
  })

  test('bails when there is no unstable_defineMediaLibrary call', () => {
    const result = appendFieldEntries(`export default {fields: []}`, ['{}'])
    expect(result).toEqual({ok: false, reason: 'no `unstable_defineMediaLibrary(...)` call found'})
  })

  test('bails when the fields value is not an array literal', () => {
    const source = SCAFFOLD.replace(/fields: \[[^]*?\],/, 'fields: sharedFields,')
    const result = appendFieldEntries(source, ['{}'])
    expect(result).toEqual({
      ok: false,
      reason: 'the `fields` value is not an array literal',
    })
  })

  test('bails when the config has no fields property', () => {
    const source = SCAFFOLD.replace(/fields: \[[^]*?\],\n/, '')
    const result = appendFieldEntries(source, ['{}'])
    expect(result).toEqual({
      ok: false,
      reason: 'no `fields` property in the `unstable_defineMediaLibrary({...})` config',
    })
  })

  test('bails when the config is not an object literal', () => {
    const source = `export default unstable_defineMediaLibrary(sharedConfig)`
    const result = appendFieldEntries(source, ['{}'])
    expect(result).toEqual({
      ok: false,
      reason: 'the `unstable_defineMediaLibrary(...)` argument is not an object literal',
    })
  })

  test('a commented-out fields array next to a computed value is not edited', () => {
    // The dangerous shape: a locator that is not comment-aware would "edit"
    // the comment, report success, and deploy would still delete the stored
    // aspects.
    const source = SCAFFOLD.replace(
      /fields: \[[^]*?\],/,
      '// fields: [{name: "old", src: "./old.tsx"}],\n    fields: computedFields,',
    )
    const result = appendFieldEntries(source, ['{}'])
    expect(result).toEqual({
      ok: false,
      reason: 'the `fields` value is not an array literal',
    })
  })

  test('a fields array outside the call does not shadow or block the real one', () => {
    const source = `const preset = {fields: []}\n${SCAFFOLD}`
    const updated = unwrap(
      appendFieldEntries(source, [`{name: 'x', src: './src/fields/x.tsx', title: 'X'},`]),
    )

    // The helper's array is untouched; the entry lands in the call's array.
    expect(updated).toContain('const preset = {fields: []}')
    expect(updated).toContain(
      `title: 'Notes'},\n      {name: 'x', src: './src/fields/x.tsx', title: 'X'},`,
    )
  })

  test('the call name inside comments or strings does not count as a second call site', () => {
    const source = SCAFFOLD.replace(
      `organizationId: 'org-1',`,
      `// also used by unstable_defineMediaLibrary(legacy)\n    note: 'see unstable_defineMediaLibrary(docs)',\n    organizationId: 'org-1',`,
    )
    const updated = unwrap(
      appendFieldEntries(source, [`{name: 'x', src: './src/fields/x.tsx', title: 'X'},`]),
    )
    expect(updated).toContain(`{name: 'x', src: './src/fields/x.tsx', title: 'X'},`)
  })

  test('a fields: [ inside a string literal does not count as an array', () => {
    const source = SCAFFOLD.replace(
      `organizationId: 'org-1',`,
      `note: 'legacy fields: [a, b] syntax',\n    organizationId: 'org-1',`,
    )
    const updated = unwrap(
      appendFieldEntries(source, [`{name: 'x', src: './src/fields/x.tsx', title: 'X'},`]),
    )
    expect(updated).toContain(
      `title: 'Notes'},\n      {name: 'x', src: './src/fields/x.tsx', title: 'X'},`,
    )
  })

  test('a fields array nested inside another config value is neither edited nor blocking', () => {
    const source = SCAFFOLD.replace(
      `organizationId: 'org-1',`,
      `extra: {fields: []},\n    organizationId: 'org-1',`,
    )
    const updated = unwrap(
      appendFieldEntries(source, [`{name: 'x', src: './src/fields/x.tsx', title: 'X'},`]),
    )

    expect(updated).toContain('extra: {fields: []},')
    expect(updated).toContain(
      `title: 'Notes'},\n      {name: 'x', src: './src/fields/x.tsx', title: 'X'},`,
    )
  })

  test('bails on duplicate fields keys rather than guessing which one deploy reads', () => {
    const source = SCAFFOLD.replace(
      `organizationId: 'org-1',`,
      `fields: [],\n    organizationId: 'org-1',`,
    )
    const result = appendFieldEntries(source, ['{}'])
    expect(result).toEqual({
      ok: false,
      reason: 'more than one `fields` property in the `unstable_defineMediaLibrary({...})` config',
    })
  })

  test('bails when the config does not parse', () => {
    const source = `export default unstable_defineMediaLibrary({fields: [`
    const result = appendFieldEntries(source, ['{}'])
    expect(result).toEqual({
      ok: false,
      reason: 'the config does not parse as TypeScript',
    })
  })
})

describe('replaceFieldEntries', () => {
  test('swaps the example entries for the provided ones', () => {
    const updated = unwrap(
      replaceFieldEntries(SCAFFOLD, [
        `{name: 'alt', src: './src/fields/alt.ts', title: 'Alt text'},`,
        `{name: 'credit', src: './src/fields/credit.ts', title: 'Credit', public: true},`,
      ]),
    )

    expect(updated).toMatchInlineSnapshot(`
      "import {defineCliConfig, unstable_defineMediaLibrary} from 'sanity/cli'

      export default defineCliConfig({
        app: unstable_defineMediaLibrary({
          organizationId: 'org-1',
          fields: [
            {name: 'alt', src: './src/fields/alt.ts', title: 'Alt text'},
            {name: 'credit', src: './src/fields/credit.ts', title: 'Credit', public: true},
          ],
        }),
      })
      "
    `)
  })
})
