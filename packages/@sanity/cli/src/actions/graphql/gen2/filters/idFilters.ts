import {type InputObjectType} from '../../types.js'

export function createIdFilters(): InputObjectType {
  return {
    fields: [
      {
        description: 'Checks if the value is equal to the given input.',
        fieldName: 'eq',
        type: 'ID',
      },
      {
        description: 'Checks if the value is not equal to the given input.',
        fieldName: 'neq',
        type: 'ID',
      },
      {
        description: 'Checks if the value matches the given word/words.',
        fieldName: 'matches',
        type: 'ID',
      },
      {
        children: {
          isNullable: false,
          type: 'ID',
        },
        description: 'Checks if the value is equal to one of the given values.',
        fieldName: 'in',
        kind: 'List',
      },
      {
        children: {
          isNullable: false,
          type: 'ID',
        },
        description: 'Checks if the value is not equal to one of the given values.',
        fieldName: 'nin',
        kind: 'List',
      },
    ],
    isConstraintFilter: true,
    kind: 'InputObject',
    name: 'IDFilter',
  }
}
