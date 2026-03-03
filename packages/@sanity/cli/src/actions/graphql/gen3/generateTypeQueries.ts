import upperFirst from 'lodash-es/upperFirst.js'

import {isDocumentType, isUnion} from '../helpers.js'
import {
  type ApiCustomizationOptions,
  type ConvertedType,
  type ConvertedUnion,
  type Deprecation,
  type InputObjectType,
  type QueryDefinition,
} from '../types.js'
import {getFilterFieldName} from './utils.js'

export function generateTypeQueries(
  types: (ConvertedType | ConvertedUnion)[],
  sortings: InputObjectType[],
  options?: ApiCustomizationOptions,
): QueryDefinition[] {
  const {filterSuffix} = options || {}
  const queries: QueryDefinition[] = []
  const documentTypes = types.filter((type) => isDocumentType(type))

  const documentTypeNames = documentTypes.map((docType) =>
    JSON.stringify(docType.originalName || docType.name),
  )
  const documentsFilter = `_type in [${documentTypeNames.join(', ')}]`

  const documentInterface = types.find((type) => type.name === 'Document')
  if (!documentInterface || isUnion(documentInterface)) {
    throw new Error('Failed to find document interface')
  }

  const queryable = [...documentTypes, documentInterface]
  const isSortable = (type: ConvertedType) =>
    sortings.some((sorting) => sorting.name === `${type.name}Sorting`)

  // Single ID-based result lookup queries
  for (const type of queryable) {
    queries.push({
      args: [
        {
          description: `${type.name} document ID`,
          isNullable: false,
          name: 'id',
          type: 'ID',
        },
      ],
      constraints: [
        {
          comparator: 'eq',
          field: '_id',
          value: {argName: 'id', kind: 'argumentValue'},
        },
      ],
      fieldName: type.name,
      type: type.name,
      ...getDeprecation(type),
    })
  }

  // Fetch all of type
  for (const type of queryable) {
    const sorting: QueryDefinition['args'] = []
    if (isSortable(type)) {
      sorting.push({
        name: 'sort',
        type: {
          children: {
            isNullable: false,
            type: `${type.name}Sorting`,
          },
          isNullable: true,
          kind: 'List',
        },
      })
    }

    queries.push({
      args: [
        {
          isFieldFilter: true,
          name: 'where',
          type: getFilterFieldName(type.name, filterSuffix),
        },
        ...sorting,
        {
          description: 'Max documents to return',
          isFieldFilter: false,
          name: 'limit',
          type: 'Int',
        },
        {
          description: 'Offset at which to start returning documents from',
          isFieldFilter: false,
          name: 'offset',
          type: 'Int',
        },
      ],
      fieldName: `all${upperFirst(type.name)}`,
      filter:
        type.name === 'Document' && type.kind === 'Interface'
          ? documentsFilter
          : `_type == ${JSON.stringify(type.originalName || type.name)}`,
      type: {
        children: {isNullable: false, type: type.name},
        isNullable: false,
        kind: 'List',
      },
      ...getDeprecation(type),
    })
  }

  return queries
}

function getDeprecation(type: ConvertedType): Partial<Deprecation> {
  return type._internal?.deprecationReason
    ? {
        deprecationReason: type._internal.deprecationReason,
      }
    : {}
}
