export const renameType = ({
  documentTypes,
  migrationName,
}: {
  documentTypes: string[]
  migrationName: string
}) => `import {defineMigration, at, set} from 'sanity/migrate'

const oldType = 'old'
const newType = 'new'

export default defineMigration({
  title: ${JSON.stringify(migrationName)},
${
  documentTypes.length > 0
    ? `  documentTypes: [${documentTypes.map((t) => JSON.stringify(t)).join(', ')}],\n`
    : ''
}
  migrate: {
    object(object, path, context) {
      if (object._type === oldType) {
        return at('_type', set(newType))
      }
    }
  }
})
`
