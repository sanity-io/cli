import {type InputObjectType} from '../../types.js'

export function createBooleanFilters(): InputObjectType {
  return {
    fields: [
      {
        description: 'Checks if the value is equal to the given input.',
        fieldName: 'eq',
        type: 'Boolean',
      },
      {
        description: 'Checks if the value is not equal to the given input.',
        fieldName: 'neq',
        type: 'Boolean',
      },
      {
        description: 'Checks if the value is defined.',
        fieldName: 'is_defined',
        type: 'Boolean',
      },
    ],
    isConstraintFilter: true,
    kind: 'InputObject',
    name: 'BooleanFilter',
  }
}
