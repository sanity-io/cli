import {type InputObjectType} from '../../types.js'

export function createDateTimeFilters(): InputObjectType {
  return {
    fields: [
      {
        description: 'Checks if the value is equal to the given input.',
        fieldName: 'eq',
        type: 'Datetime',
      },
      {
        description: 'Checks if the value is not equal to the given input.',
        fieldName: 'neq',
        type: 'Datetime',
      },
      {
        description: 'Checks if the value is greater than the given input.',
        fieldName: 'gt',
        type: 'Datetime',
      },
      {
        description: 'Checks if the value is greater than or equal to the given input.',
        fieldName: 'gte',
        type: 'Datetime',
      },
      {
        description: 'Checks if the value is lesser than the given input.',
        fieldName: 'lt',
        type: 'Datetime',
      },
      {
        description: 'Checks if the value is lesser than or equal to the given input.',
        fieldName: 'lte',
        type: 'Datetime',
      },
      {
        description: 'Checks if the value is defined.',
        fieldName: 'is_defined',
        type: 'Boolean',
      },
    ],
    isConstraintFilter: true,
    kind: 'InputObject',
    name: 'DatetimeFilter',
  }
}
