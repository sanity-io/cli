import {describe, expect, test} from 'vitest'

import {renameType} from '../renameType'

describe('#renameType', () => {
  test('creates template with no doc types', () => {
    const renameTypeTemplate = renameType({
      documentTypes: [],
      migrationName: 'My Migration',
    })

    expect(renameTypeTemplate).toMatchInlineSnapshot(`
      "import {defineMigration, at, set} from 'sanity/migrate'

      const oldType = 'old'
      const newType = 'new'

      export default defineMigration({
        title: 'My Migration',

        migrate: {
          object(object, path, context) {
            if (object._type === oldType) {
              return at('_type', set(newType))
            }
          }
        }
      })
      "
    `)
  })

  test('creates template with doc types', () => {
    const renameTypeTemplate = renameType({
      documentTypes: ['document-1', 'document-2', 'document-3'],
      migrationName: 'My Migration',
    })

    expect(renameTypeTemplate).toMatchInlineSnapshot(`
      "import {defineMigration, at, set} from 'sanity/migrate'

      const oldType = 'old'
      const newType = 'new'

      export default defineMigration({
        title: 'My Migration',
        documentTypes: ["document-1", "document-2", "document-3"],

        migrate: {
          object(object, path, context) {
            if (object._type === oldType) {
              return at('_type', set(newType))
            }
          }
        }
      })
      "
    `)
  })
})
