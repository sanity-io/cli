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
    expect(result).toEqual({ok: false, reason: 'no `fields: [...]` array literal found'})
  })

  test('bails on multiple fields arrays rather than guessing', () => {
    const source = `${SCAFFOLD}\nconst other = {fields: []}\n`
    const result = appendFieldEntries(source, ['{}'])
    expect(result).toEqual({ok: false, reason: 'more than one `fields: [...]` array found'})
  })

  test('bails when the array never closes', () => {
    const source = `export default unstable_defineMediaLibrary({fields: [`
    const result = appendFieldEntries(source, ['{}'])
    expect(result).toEqual({ok: false, reason: 'the `fields` array never closes'})
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
