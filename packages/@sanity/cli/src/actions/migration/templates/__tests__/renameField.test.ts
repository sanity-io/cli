import {describe, expect, test} from 'vitest'

import {renameField} from '../renameField'

describe('#renameField', () => {
  test('creates template with no doc types', () => {
    const renameFieldTemplate = renameField({
      documentTypes: [],
      migrationName: 'My Migration',
    })

    expect(renameFieldTemplate).toMatchInlineSnapshot(`
      "import {defineMigration, at, setIfMissing, unset} from 'sanity/migrate'

      const from = 'oldFieldName'
      const to = 'newFieldName'

      export default defineMigration({
        title: 'My Migration',

        migrate: {
          document(doc, context) {
            return [
              at(to, setIfMissing(doc[from])),
              at(from, unset())
            ]
          }
        }
      })
      "
    `)
  })

  test('creates template with doc types', () => {
    const renameFieldTemplate = renameField({
      documentTypes: ['document-1', 'document-2', 'document-3'],
      migrationName: 'My Migration',
    })

    expect(renameFieldTemplate).toMatchInlineSnapshot(`
      "import {defineMigration, at, setIfMissing, unset} from 'sanity/migrate'

      const from = 'oldFieldName'
      const to = 'newFieldName'

      export default defineMigration({
        title: 'My Migration',
        documentTypes: ["document-1", "document-2", "document-3"],

        migrate: {
          document(doc, context) {
            return [
              at(to, setIfMissing(doc[from])),
              at(from, unset())
            ]
          }
        }
      })
      "
    `)
  })
})
