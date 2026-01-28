import {upperFirst} from 'lodash-es'

import {isDocumentType} from '../helpers.js'
import {
  type ConvertedType,
  type ConvertedUnion,
  type InputObjectType,
  type QueryDefinition,
} from '../types.js'

export function generateTypeQueries(
  types: (ConvertedType | ConvertedUnion)[],
  sortings: InputObjectType[],
): QueryDefinition[] {
  const queries: QueryDefinition[] = []
  const queryable = types.filter((type) => isDocumentType(type))
  const isSortable = (type: ConvertedType) =>
    sortings.some((sorting) => sorting.name === `${type.name}Sorting`)

  // A document of any type
  queries.push({
    args: [
      {
        description: 'Document ID',
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
    fieldName: 'Document',
    type: 'Document',
  })

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
          type: `${type.name}Filter`,
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
      filter: `_type == "${type.originalName || type.name}"`,
      type: {
        children: {isNullable: false, type: type.name},
        isNullable: false,
        kind: 'List',
      },
    })
  }

  return queries
}
