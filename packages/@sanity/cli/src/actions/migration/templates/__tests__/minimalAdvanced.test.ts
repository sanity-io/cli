import {describe, expect, test} from 'vitest'

import {minimalAdvanced} from '../minimalAdvanced'

describe('#minimalAdvanced', () => {
  test('creates template with no doc types', () => {
    const minimalAdvancedTemplate = minimalAdvanced({
      documentTypes: [],
      migrationName: 'My Migration',
    })

    expect(minimalAdvancedTemplate).toMatchInlineSnapshot(`
      "import {defineMigration, patch, at, setIfMissing} from 'sanity/migrate'

      /**
       * this migration will set \`Default title\` on all documents that are missing a title
       * and make \`true\` the default value for the \`enabled\` field
       */
      export default defineMigration({
        title: "My Migration",

        async *migrate(documents, context) {
          for await (const document of documents()) {
            yield patch(document._id, [
              at('title', setIfMissing('Default title')),
              at('enabled', setIfMissing(true)),
            ])
          }
        }
      })
      "
    `)
  })

  test('creates template with doc types', () => {
    const minimalAdvancedTemplate = minimalAdvanced({
      documentTypes: ['document-1', 'document-2', 'document-3'],
      migrationName: 'My Migration',
    })

    expect(minimalAdvancedTemplate).toMatchInlineSnapshot(`
      "import {defineMigration, patch, at, setIfMissing} from 'sanity/migrate'

      /**
       * this migration will set \`Default title\` on all documents that are missing a title
       * and make \`true\` the default value for the \`enabled\` field
       */
      export default defineMigration({
        title: "My Migration",
        documentTypes: ["document-1", "document-2", "document-3"],

        async *migrate(documents, context) {
          for await (const document of documents()) {
            yield patch(document._id, [
              at('title', setIfMissing('Default title')),
              at('enabled', setIfMissing(true)),
            ])
          }
        }
      })
      "
    `)
  })
})
