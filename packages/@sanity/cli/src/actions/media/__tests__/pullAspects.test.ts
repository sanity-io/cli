import {describe, expect, test} from 'vitest'

import {
  aspectDocumentToFieldModule,
  formatFieldEntries,
  type GeneratedFieldModule,
} from '../pullAspects.js'

function generated(doc: Parameters<typeof aspectDocumentToFieldModule>[0]): GeneratedFieldModule {
  const outcome = aspectDocumentToFieldModule(doc)
  if (outcome.status !== 'generated') {
    throw new Error(
      `Expected generated, got skipped: ${outcome.reasons.join('; ')} ${JSON.stringify(outcome.validationErrors)}`,
    )
  }
  return outcome
}

describe('aspectDocumentToFieldModule', () => {
  test('generates a module from a simple stored definition', () => {
    const outcome = generated({
      _id: 'altText',
      definition: {
        description: 'Short description for screen readers',
        name: 'altText',
        title: 'Alt text',
        type: 'string',
      },
    })

    expect(outcome.name).toBe('altText')
    expect(outcome.filename).toBe('altText.tsx')
    expect(outcome.title).toBe('Alt text')
    expect(outcome.public).toBeUndefined()
    expect(outcome.warnings).toEqual([])
    expect(outcome.source).toMatchInlineSnapshot(`
      "import {defineField} from 'sanity'

      export default defineField({
        description: 'Short description for screen readers',
        name: 'altText',
        title: 'Alt text',
        type: 'string',
      })
      "
    `)
  })

  test('wraps nested fields and array members in definer calls', () => {
    const outcome = generated({
      _id: 'seo',
      definition: {
        fields: [
          {
            name: 'keywords',
            of: [{type: 'string'}],
            title: 'Keywords',
            type: 'array',
          },
          {
            initialValue: 'en',
            name: 'language',
            options: {list: ['en', 'de', 'no']},
            type: 'string',
          },
        ],
        name: 'seo',
        title: 'SEO',
        type: 'object',
      },
    })

    expect(outcome.source).toMatchInlineSnapshot(`
      "import {defineArrayMember, defineField} from 'sanity'

      export default defineField({
        fields: [
          defineField({
            name: 'keywords',
            of: [
              defineArrayMember({
                type: 'string',
              }),
            ],
            title: 'Keywords',
            type: 'array',
          }),
          defineField({
            initialValue: 'en',
            name: 'language',
            options: {
              list: ['en', 'de', 'no'],
            },
            type: 'string',
          }),
        ],
        name: 'seo',
        title: 'SEO',
        type: 'object',
      })
      "
    `)
  })

  test('escapes quotes and prints non-identifier keys quoted', () => {
    const outcome = generated({
      _id: 'copyright',
      definition: {
        name: 'copyright',
        options: {'aria-label': 'notice'},
        title: "Rights holder's notice",
        type: 'string',
      },
    })

    expect(outcome.source).toMatchInlineSnapshot(`
      "import {defineField} from 'sanity'

      export default defineField({
        name: 'copyright',
        options: {
          'aria-label': 'notice',
        },
        title: 'Rights holder\\'s notice',
        type: 'string',
      })
      "
    `)
  })

  test('carries the stored public flag into the result', () => {
    const outcome = generated({
      _id: 'credit',
      definition: {name: 'credit', title: 'Credit', type: 'string'},
      public: true,
    })

    expect(outcome.public).toBe(true)
  })

  test('generates under definition.name on _id mismatch, with a warning', () => {
    const outcome = generated({
      _id: 'legacyCaption',
      definition: {name: 'caption', title: 'Caption', type: 'string'},
    })

    expect(outcome.name).toBe('caption')
    expect(outcome.filename).toBe('caption.tsx')
    expect(outcome.warnings).toHaveLength(1)
    expect(outcome.warnings[0]).toContain('"legacyCaption" and definition name "caption" differ')
    expect(outcome.warnings[0]).toContain('deletes the old "legacyCaption" document')
  })

  test('falls back to the document _id when the definition has no name', () => {
    const outcome = generated({
      _id: 'notes',
      definition: {title: 'Notes', type: 'text'},
    })

    expect(outcome.name).toBe('notes')
    expect(outcome.warnings).toHaveLength(1)
    expect(outcome.warnings[0]).toContain('has no name')
    expect(outcome.source).toContain(`name: 'notes',`)
  })

  test('warns when the stored document scopes by assetType', () => {
    const outcome = generated({
      _id: 'exif',
      assetType: 'sanity.imageAsset',
      definition: {name: 'exif', title: 'EXIF', type: 'string'},
    })

    expect(outcome.warnings).toHaveLength(1)
    expect(outcome.warnings[0]).toContain('assetType')
    expect(outcome.warnings[0]).toContain('no equivalent')
  })

  test('derives a title from the name when the definition has none', () => {
    const outcome = generated({
      _id: 'altText',
      definition: {name: 'altText', type: 'string'},
    })

    expect(outcome.title).toBe('Alt Text')
  })

  test('skips documents without a definition object', () => {
    const outcome = aspectDocumentToFieldModule({_id: 'broken'})

    expect(outcome.status).toBe('skipped')
    if (outcome.status !== 'skipped') throw new Error('unreachable')
    expect(outcome.reasons[0]).toContain('no field definition object')
  })

  test('skips documents whose resolved name is not a valid field name', () => {
    const outcome = aspectDocumentToFieldModule({
      _id: 'has-hyphens',
      definition: {title: 'Bad', type: 'string'},
    })

    expect(outcome.status).toBe('skipped')
    if (outcome.status !== 'skipped') throw new Error('unreachable')
    expect(outcome.reasons[0]).toContain('"has-hyphens" is not a valid field name')
  })

  test('skips definitions that fail schema validation, carrying the errors', () => {
    const outcome = aspectDocumentToFieldModule({
      _id: 'invalid',
      definition: {
        // Objects must declare their fields.
        fields: [],
        name: 'invalid',
        title: 'Invalid',
        type: 'object',
      },
    })

    expect(outcome.status).toBe('skipped')
    if (outcome.status !== 'skipped') throw new Error('unreachable')
    expect(outcome.reasons[0]).toContain('fails schema validation')
    expect(outcome.validationErrors.flat().length).toBeGreaterThan(0)
  })
})

describe('formatFieldEntries', () => {
  test('prints paste-ready sanity.cli.ts entries', () => {
    const entries = [
      generated({
        _id: 'caption',
        definition: {name: 'caption', title: 'Caption', type: 'string'},
      }),
      generated({
        _id: 'seo',
        definition: {name: 'seo', title: "SEO 'n stuff", type: 'string'},
        public: true,
      }),
    ]

    expect(formatFieldEntries(entries, 'src/fields')).toMatchInlineSnapshot(`
      "{name: 'caption', src: './src/fields/caption.tsx', title: 'Caption'},
      {name: 'seo', src: './src/fields/seo.tsx', title: 'SEO \\'n stuff', public: true},"
    `)
  })
})
