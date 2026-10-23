import {
  MEDIA_LIBRARY_ASSET_ASPECT_TYPE_NAME,
  type MediaLibraryAssetAspectDocument,
} from '@sanity/types'
import {describe, expect, expectTypeOf, test} from 'vitest'

import {
  ASPECT_TYPE,
  type AspectDocument,
  buildSyncMutations,
  computeMirrorDiff,
  serializeField,
} from '../contract.js'

// Drift guard against the read-side type in @sanity/types: the write
// payload's envelope fields must keep matching the stored document.
// `definition` intentionally differs (stripped JSON vs FieldDefinition) and
// server-assigned metadata (_rev etc.) is intentionally absent — see the
// AspectDocument doc comment.
expectTypeOf<AspectDocument['_id']>().toEqualTypeOf<MediaLibraryAssetAspectDocument['_id']>()
expectTypeOf<AspectDocument['_type']>().toEqualTypeOf<MediaLibraryAssetAspectDocument['_type']>()
expectTypeOf<AspectDocument['public']>().toEqualTypeOf<MediaLibraryAssetAspectDocument['public']>()

test('the vendored type name matches the canonical constant', () => {
  expect(ASPECT_TYPE).toBe(MEDIA_LIBRARY_ASSET_ASPECT_TYPE_NAME)
})

const entry = {name: 'notes', src: './src/fields/notes.tsx', title: 'Notes'}

describe('serializeField', () => {
  test('passes literal values through and builds the document envelope', () => {
    const {document, stripped} = serializeField(entry, {
      fields: [{name: 'text', options: {maxLength: 500}, type: 'text'}],
      name: 'notes',
      title: 'Notes',
      type: 'object',
    })

    expect(document).toEqual({
      _id: 'notes',
      _type: ASPECT_TYPE,
      definition: {
        fields: [{name: 'text', options: {maxLength: 500}, type: 'text'}],
        name: 'notes',
        title: 'Notes',
        type: 'object',
      },
    })
    expect(stripped).toEqual([])
  })

  test('strips functions and records their paths', () => {
    const {document, stripped} = serializeField(entry, {
      fields: [{name: 'text', type: 'text', validation: () => undefined}],
      initialValue: () => ({}),
      name: 'notes',
      type: 'object',
    })

    expect(stripped).toEqual(['definition.fields[0].validation', 'definition.initialValue'])
    expect(document.definition).not.toHaveProperty('initialValue')
    expect((document.definition.fields as unknown[])[0]).not.toHaveProperty('validation')
  })

  test('strips components wholesale and react-element-like objects', () => {
    const {document, stripped} = serializeField(entry, {
      components: {input: () => null},
      fields: [
        {name: 'icon', options: {preview: {$$typeof: Symbol.for('react.element')}}, type: 'string'},
      ],
      name: 'notes',
      type: 'object',
    })

    expect(stripped).toContain('definition.components')
    expect(stripped).toContain('definition.fields[0].options.preview')
    expect(document.definition).not.toHaveProperty('components')
  })

  test('keeps null and drops undefined members', () => {
    const {document, stripped} = serializeField(entry, {
      description: null,
      hidden: undefined,
      name: 'notes',
      type: 'object',
    })

    expect(document.definition.description).toBeNull()
    expect(document.definition).not.toHaveProperty('hidden')
    expect(stripped).toEqual(['definition.hidden'])
  })

  test('carries the public flag only when set', () => {
    const definition = {name: 'seo', type: 'object'}
    expect(serializeField({...entry, name: 'seo'}, definition).document).not.toHaveProperty(
      'public',
    )
    expect(serializeField({...entry, name: 'seo', public: true}, definition).document.public).toBe(
      true,
    )
    expect(serializeField({...entry, name: 'seo', public: false}, definition).document.public).toBe(
      false,
    )
  })

  test('drops a non-boolean public value instead of serializing it', () => {
    // A JS config app isn't bound by the FieldEntry type; a mistyped
    // 'false' would flip the aspect public via downstream Boolean coercion.
    const definition = {name: 'seo', type: 'object'}
    const {document} = serializeField(
      {...entry, name: 'seo', public: 'false' as unknown as boolean},
      definition,
    )
    expect(document).not.toHaveProperty('public')
  })

  test('rejects a definition whose name differs from the entry name', () => {
    // _id (the mirror's upsert/delete key) and definition.name (the
    // aspects.<name> data key) must not diverge in a stored document.
    expect(() => serializeField(entry, {name: 'somethingElse', type: 'object'})).toThrow(
      /names must match/,
    )
  })

  test('rejects values that are not field definitions', () => {
    expect(() => serializeField(entry, undefined)).toThrow(/defineField/)
    expect(() => serializeField(entry, {title: 'No name or type'})).toThrow(/defineField/)
  })

  test('rejects entry names that cannot be a document _id / aspects key', () => {
    const definition = {name: 'notes', type: 'object'}
    for (const name of ['my field', '1st', 'a-b', 'a.b', '']) {
      expect(() => serializeField({...entry, name}, definition)).toThrow(/not a valid aspect name/)
    }
  })

  test('strips non-plain objects (Date, RegExp, Map) with their paths', () => {
    const {document, stripped} = serializeField(entry, {
      name: 'notes',
      options: {lookup: new Map(), pattern: /x/, since: new Date(0)},
      type: 'object',
    })

    expect(stripped).toEqual([
      'definition.options.lookup',
      'definition.options.pattern',
      'definition.options.since',
    ])
    expect(document.definition.options).toEqual({})
  })

  test('serializes a shared acyclic reference at every site', () => {
    const sharedOptions = {maxLength: 10}
    const {document, stripped} = serializeField(entry, {
      fields: [
        {name: 'a', options: sharedOptions, type: 'string'},
        {name: 'b', options: sharedOptions, type: 'string'},
      ],
      name: 'notes',
      type: 'object',
    })

    expect(stripped).toEqual([])
    const fields = document.definition.fields as {options: unknown}[]
    expect(fields[0].options).toEqual({maxLength: 10})
    expect(fields[1].options).toEqual({maxLength: 10})
  })

  test('strips circular references instead of overflowing the stack', () => {
    const options: Record<string, unknown> = {maxLength: 10}
    options.self = options
    const {document, stripped} = serializeField(entry, {
      name: 'notes',
      options,
      type: 'object',
    })

    expect(stripped).toEqual(['definition.options.self'])
    expect(document.definition.options).toEqual({maxLength: 10})
  })
})

describe('computeMirrorDiff', () => {
  const configDocuments = [
    {_id: 'seo', _type: ASPECT_TYPE, definition: {}},
    {_id: 'notes', _type: ASPECT_TYPE, definition: {}},
  ] as const

  test('flags stored ids missing from the config as stale', () => {
    expect(computeMirrorDiff(configDocuments, ['seo', 'notes', 'legacy'])).toEqual({
      staleIds: ['legacy'],
    })
  })

  test('empty store yields no stale ids', () => {
    expect(computeMirrorDiff(configDocuments, [])).toEqual({staleIds: []})
  })

  test('empty config marks everything stale', () => {
    expect(computeMirrorDiff([], ['a', 'b'])).toEqual({staleIds: ['a', 'b']})
  })
})

describe('buildSyncMutations', () => {
  test('upserts config documents and deletes stale ids in one transaction', () => {
    const document = {_id: 'seo', _type: ASPECT_TYPE, definition: {}} as const
    expect(buildSyncMutations([document], ['legacy'])).toEqual([
      {createOrReplace: document},
      {
        delete: {
          params: {id: 'legacy', type: ASPECT_TYPE},
          query: `*[_type == $type && _id == $id]`,
        },
      },
    ])
  })
})
