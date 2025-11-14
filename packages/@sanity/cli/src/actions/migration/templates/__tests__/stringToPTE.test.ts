import {describe, expect, test} from 'vitest'

import {stringToPTE} from '../stringToPTE'

describe('#stringToPTE', () => {
  test('creates template with no doc types', () => {
    const stringToPTETemplate = stringToPTE({
      documentTypes: [],
      migrationName: 'My Migration',
    })

    expect(stringToPTETemplate).toMatchInlineSnapshot(`
      "import {pathsAreEqual, stringToPath} from 'sanity'
      import {defineMigration, set} from 'sanity/migrate'

      const targetPath = stringToPath('some.path')

      export default defineMigration({
        title: "My Migration",

        migrate: {
          string(node, path, ctx) {
            if (pathsAreEqual(path, targetPath)) {
              return set([
                {
                  style: 'normal',
                  _type: 'block',
                  children: [
                    {
                      _type: 'span',
                      marks: [],
                      text: node,
                    },
                  ],
                  markDefs: [],
                },
              ])
            }
          },
        },
      })
      "
    `)
  })

  test('creates template with doc types', () => {
    const stringToPTETemplate = stringToPTE({
      documentTypes: ['document-1', 'document-2', 'document-3'],
      migrationName: 'My Migration',
    })

    expect(stringToPTETemplate).toMatchInlineSnapshot(`
      "import {pathsAreEqual, stringToPath} from 'sanity'
      import {defineMigration, set} from 'sanity/migrate'

      const targetPath = stringToPath('some.path')

      export default defineMigration({
        title: "My Migration",
        documentTypes: ["document-1", "document-2", "document-3"],

        migrate: {
          string(node, path, ctx) {
            if (pathsAreEqual(path, targetPath)) {
              return set([
                {
                  style: 'normal',
                  _type: 'block',
                  children: [
                    {
                      _type: 'span',
                      marks: [],
                      text: node,
                    },
                  ],
                  markDefs: [],
                },
              ])
            }
          },
        },
      })
      "
    `)
  })
})
