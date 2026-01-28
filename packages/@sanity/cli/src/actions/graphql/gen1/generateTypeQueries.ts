import {startCase, upperFirst} from 'lodash-es'
import pluralize from 'pluralize-esm'

import {isNonUnion} from '../helpers.js'
import {
  type ConvertedType,
  type ConvertedUnion,
  type InputObjectType,
  type QueryDefinition,
} from '../types.js'

function pluralizeTypeName(name: string): string {
  const words = startCase(name).split(' ')
  const last = words.at(-1)
  // `pluralize` previously incorrectly cased the S to uppercase after numbers,
  // which we need to maintain for backwards compatibility
  const plural = pluralize(last?.toLowerCase() ?? '').replaceAll(/(\d)s$/g, '$1S')
  words[words.length - 1] = upperFirst(plural)
  return words.join('')
}

export function generateTypeQueries(
  types: (ConvertedType | ConvertedUnion)[],
  filters: InputObjectType[],
): QueryDefinition[] {
  const queries: QueryDefinition[] = []
  const queryable = types
    .filter((type) => isNonUnion(type))
    .filter(
      (type) => type.type === 'Object' && type.interfaces && type.interfaces.includes('Document'),
    )

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
          comparator: 'EQUALS',
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
    const filterName = `${type.name}Filter`
    const hasFilter = filters.find((filter) => filter.name === filterName)
    queries.push({
      args: hasFilter
        ? [{isFieldFilter: true, name: 'where', type: filterName}, ...getLimitOffsetArgs()]
        : getLimitOffsetArgs(),
      fieldName: `all${pluralizeTypeName(type.name)}`,
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

function getLimitOffsetArgs(): QueryDefinition['args'] {
  return [
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
  ]
}
