import flatten from 'lodash-es/flatten.js'

import {isNonUnion} from '../helpers.js'
import {
  type ConvertedField,
  type ConvertedFieldDefinition,
  type ConvertedType,
  type ConvertedUnion,
  type InputFilterField,
  type InputObjectType,
} from '../types.js'

type FilterCreator = (field: ConvertedField) => InputFilterField[]

const filterCreators: Record<string, FilterCreator> = {
  Boolean: createBooleanFilters,
  Date: createDateFilters,
  Datetime: createDateFilters,
  Float: createNumberFilters,
  ID: createIdFilters,
  Integer: createNumberFilters,
  Object: createObjectFilters,
  String: createStringFilters,
  Url: createStringFilters,
}

export function generateTypeFilters(types: (ConvertedType | ConvertedUnion)[]): InputObjectType[] {
  const queryable = types
    .filter((type) => isNonUnion(type))
    .filter(
      (type) => type.type === 'Object' && type.interfaces && type.interfaces.includes('Document'),
    )

  return queryable.map((type) => {
    const name = `${type.name}Filter`
    const fields = flatten(type.fields.map((field) => createFieldFilters(field))).filter(Boolean)
    return {fields: [...fields, ...getDocumentFilters()], kind: 'InputObject', name}
  })
}

function createFieldFilters(field: ConvertedField) {
  if (filterCreators[field.type]) {
    return filterCreators[field.type](field)
  }

  if (field.kind === 'List') {
    return createListFilters()
  }

  if (field.isReference) {
    return createReferenceFilters(field)
  }

  return createInlineTypeFilters()
}

function getFieldName(field: ConvertedField, modifier = '') {
  const suffix = modifier ? `_${modifier}` : ''
  return `${field.fieldName}${suffix}`
}

function getDocumentFilters(): InputFilterField[] {
  return [
    {
      constraint: {
        comparator: 'REFERENCES',
      },
      description: 'All documents references the given document ID',
      fieldName: 'references',
      type: 'ID',
    },
    {
      constraint: {
        comparator: 'IS_DRAFT',
        field: '_id',
      },
      description: 'All documents that are drafts',
      fieldName: 'is_draft',
      type: 'Boolean',
    },
  ]
}

function createIsDefinedFilter(field: ConvertedFieldDefinition): InputFilterField {
  return {
    constraint: {
      comparator: 'IS_DEFINED',
      field: field.fieldName,
    },
    description: 'All documents that have a value for this field',
    fieldName: getFieldName(field, 'is_defined'),
    type: 'Boolean',
  }
}

function createEqualityFilter(field: ConvertedFieldDefinition): InputFilterField {
  return {
    constraint: {
      comparator: 'EQUALS',
      field: field.fieldName,
    },
    description: 'All documents that are equal to given value',
    fieldName: getFieldName(field),
    type: field.type,
  }
}

function createInequalityFilter(field: ConvertedFieldDefinition): InputFilterField {
  return {
    constraint: {
      comparator: 'NOT_EQUALS',
      field: field.fieldName,
    },
    description: 'All documents that are not equal to given value',
    fieldName: getFieldName(field, 'not'),
    type: field.type,
  }
}

function createDefaultFilters(field: ConvertedFieldDefinition): InputFilterField[] {
  return [createEqualityFilter(field), createInequalityFilter(field), createIsDefinedFilter(field)]
}

function createGtLtFilters(field: ConvertedFieldDefinition): InputFilterField[] {
  return [
    {
      constraint: {
        comparator: 'LT',
        field: field.fieldName,
      },
      description: 'All documents are less than given value',
      fieldName: getFieldName(field, 'lt'),
      type: field.type,
    },
    {
      constraint: {
        comparator: 'LTE',
        field: field.fieldName,
      },
      description: 'All documents are less than or equal to given value',
      fieldName: getFieldName(field, 'lte'),
      type: field.type,
    },
    {
      constraint: {
        comparator: 'GT',
        field: field.fieldName,
      },
      description: 'All documents are greater than given value',
      fieldName: getFieldName(field, 'gt'),
      type: field.type,
    },
    {
      constraint: {
        comparator: 'GTE',
        field: field.fieldName,
      },
      description: 'All documents are greater than or equal to given value',
      fieldName: getFieldName(field, 'gte'),
      type: field.type,
    },
  ]
}

function createBooleanFilters(field: ConvertedFieldDefinition): InputFilterField[] {
  return createDefaultFilters(field)
}

function createIdFilters(field: ConvertedFieldDefinition): InputFilterField[] {
  return createStringFilters(field)
}

function createDateFilters(field: ConvertedFieldDefinition): InputFilterField[] {
  return [...createDefaultFilters(field), ...createGtLtFilters(field)]
}

function createStringFilters(field: ConvertedFieldDefinition): InputFilterField[] {
  return [
    ...createDefaultFilters(field),
    {
      constraint: {
        comparator: 'MATCHES',
        field: field.fieldName,
      },
      description: 'All documents contain (match) the given word/words',
      fieldName: getFieldName(field, 'matches'),
      type: 'String',
    },
    {
      children: {
        isNullable: false,
        type: 'String',
      },
      constraint: {
        comparator: 'IN',
        field: field.fieldName,
      },
      description: 'All documents match one of the given values',
      fieldName: getFieldName(field, 'in'),
      kind: 'List',
    },
    {
      children: {
        isNullable: false,
        type: 'String',
      },
      constraint: {
        comparator: 'NOT_IN',
        field: field.fieldName,
      },
      description: 'None of the values match any of the given values',
      fieldName: getFieldName(field, 'not_in'),
      kind: 'List',
    },
  ]
}

function createNumberFilters(field: ConvertedFieldDefinition): InputFilterField[] {
  return [...createDefaultFilters(field), ...createGtLtFilters(field)]
}

function createObjectFilters(_field: ConvertedFieldDefinition): InputFilterField[] {
  return []
}

function createListFilters(): InputFilterField[] {
  return []
}

function createInlineTypeFilters(): InputFilterField[] {
  return []
}

function createReferenceFilters(field: ConvertedFieldDefinition): InputFilterField[] {
  return [
    {
      constraint: {
        comparator: 'EQUALS',
        field: `${field.fieldName}._ref`,
      },
      fieldName: getFieldName(field),
      type: 'ID',
    },
  ]
}
