import {isDocumentType, isNonUnion} from '../helpers.js'
import {
  type ConvertedEnum,
  type ConvertedType,
  type ConvertedUnion,
  type InputObjectType,
} from '../types.js'

const builtInTypes = new Set([
  'Boolean',
  'Date',
  'Datetime',
  'Email',
  'Float',
  'ID',
  'Integer',
  'String',
  'Text',
  'Url',
])

const builtInSortingEnum: ConvertedEnum = {
  kind: 'Enum',
  name: 'SortOrder',
  values: [
    {
      description: 'Sorts on the value in ascending order.',
      name: 'ASC',
      value: 1,
    },
    {
      description: 'Sorts on the value in descending order.',
      name: 'DESC',
      value: 2,
    },
  ],
}

export function generateTypeSortings(
  types: (ConvertedType | ConvertedUnion)[],
): (ConvertedEnum | InputObjectType)[] {
  const objectTypes = types
    .filter((type) => isNonUnion(type))
    .filter(
      (type) =>
        type.type === 'Object' &&
        !['Block', 'Span'].includes(type.name) && // TODO: What do we do with blocks?
        !type.interfaces &&
        !builtInTypes.has(type.name),
    )

  const documentTypes = types.filter((type) => isDocumentType(type))

  const hasFields = (type: InputObjectType) => type.fields.length > 0

  const objectTypeSortings = createObjectTypeSortings(objectTypes)
  const documentTypeSortings = createDocumentTypeSortings(documentTypes)
  const allSortings = [...objectTypeSortings, ...documentTypeSortings].filter((type) =>
    hasFields(type),
  )

  return [...allSortings, builtInSortingEnum]
}

function createObjectTypeSortings(objectTypes: ConvertedType[]): InputObjectType[] {
  return objectTypes.map((objectType) => ({
    fields: objectType.fields
      .filter((field) => field.type !== 'JSON' && field.kind !== 'List')
      .filter((field) => !field.isReference)
      .map((field) => ({
        fieldName: field.fieldName,
        type: builtInTypes.has(field.type) ? builtInSortingEnum.name : `${field.type}Sorting`,
      })),
    kind: 'InputObject',
    name: `${objectType.name}Sorting`,
  }))
}

function createDocumentTypeSortings(documentTypes: ConvertedType[]): InputObjectType[] {
  return documentTypes.map((documentType) => ({
    fields: documentType.fields
      .filter((field) => field.type !== 'JSON' && field.kind !== 'List')
      .filter((field) => !field.isReference)
      .map((field) => ({
        fieldName: field.fieldName,
        type: builtInTypes.has(field.type) ? builtInSortingEnum.name : `${field.type}Sorting`,
      })),
    kind: 'InputObject',
    name: `${documentType.name}Sorting`,
  }))
}
