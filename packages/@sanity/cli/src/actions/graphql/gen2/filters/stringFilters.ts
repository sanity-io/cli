import {type InputObjectType} from '../../types.js'

export function createStringFilters(): InputObjectType {
  return {
    fields: [
      {
        description: 'Checks if the value is equal to the given input.',
        fieldName: 'eq',
        type: 'String',
      },
      {
        description: 'Checks if the value is not equal to the given input.',
        fieldName: 'neq',
        type: 'String',
      },
      {
        description: 'Checks if the value matches the given word/words.',
        fieldName: 'matches',
        type: 'String',
      },
      {
        children: {
          isNullable: false,
          type: 'String',
        },
        description: 'Checks if the value is equal to one of the given values.',
        fieldName: 'in',
        kind: 'List',
      },
      {
        children: {
          isNullable: false,
          type: 'String',
        },
        description: 'Checks if the value is not equal to one of the given values.',
        fieldName: 'nin',
        kind: 'List',
      },
      {
        description: 'Checks if the value is defined.',
        fieldName: 'is_defined',
        type: 'Boolean',
      },
    ],
    isConstraintFilter: true,
    kind: 'InputObject',
    name: 'StringFilter',
  }
}
