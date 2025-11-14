export const renameField = ({
  documentTypes,
  migrationName,
}: {
  documentTypes: string[]
  migrationName: string
}) => `import {defineMigration, at, setIfMissing, unset} from 'sanity/migrate'

const from = 'oldFieldName'
const to = 'newFieldName'

export default defineMigration({
  title: ${JSON.stringify(migrationName)},
${
  documentTypes.length > 0
    ? `  documentTypes: [${documentTypes.map((t) => JSON.stringify(t)).join(', ')}],\n`
    : ''
}
  migrate: {
    document(doc, context) {
      return [
        at(to, setIfMissing(doc[from])),
        at(from, unset())
      ]
    }
  }
})
`
