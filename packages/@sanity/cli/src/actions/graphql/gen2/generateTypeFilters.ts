import {isNonUnion, isUnion} from '../helpers.js'
import {type ConvertedType, type ConvertedUnion, type InputObjectType} from '../types.js'
import {createBooleanFilters} from './filters/booleanFilters.js'
import {createDateFilters} from './filters/dateFilters.js'
import {createDateTimeFilters} from './filters/dateTimeFilters.js'
import {createDocumentFilters} from './filters/documentFilters.js'
import {createFloatFilters} from './filters/floatFilters.js'
import {createIdFilters} from './filters/idFilters.js'
import {createIntegerFilters} from './filters/integerFilters.js'
import {createStringFilters} from './filters/stringFilters.js'

const typeAliases: Record<string, string | undefined> = {
  Email: 'String',
  Text: 'String',
  Url: 'String',
}

type FilterCreator = () => InputObjectType

const filterCreators: Record<string, FilterCreator> = {
  Boolean: createBooleanFilters,
  Date: createDateFilters,
  Datetime: createDateTimeFilters,
  Document: createDocumentFilters,
  Float: createFloatFilters,
  ID: createIdFilters,
  Integer: createIntegerFilters,
  String: createStringFilters,
}

export function generateTypeFilters(types: (ConvertedType | ConvertedUnion)[]): InputObjectType[] {
  const builtInTypeKeys = Object.keys(filterCreators)
  const builtinTypeValues = Object.values(filterCreators)
  const objectTypes = types
    .filter((type) => isNonUnion(type))
    .filter(
      (type) =>
        type.type === 'Object' &&
        !['Block', 'Span'].includes(type.name) &&
        !type.interfaces &&
        !builtInTypeKeys.includes(type.type),
    )

  const unionTypes = types.filter((type) => isUnion(type)).map((type) => type.name)
  const documentTypes = types
    .filter((type) => isNonUnion(type))
    .filter(
      (type) => type.type === 'Object' && type.interfaces && type.interfaces.includes('Document'),
    )

  const builtinTypeFilters = createBuiltinTypeFilters(builtinTypeValues)
  const objectTypeFilters = createObjectTypeFilters(objectTypes, {unionTypes})
  const documentTypeFilters = createDocumentTypeFilters(documentTypes, {unionTypes})

  return [...builtinTypeFilters, ...objectTypeFilters, ...documentTypeFilters]
}

function createBuiltinTypeFilters(builtinTypeValues: FilterCreator[]): InputObjectType[] {
  return builtinTypeValues.map((filterCreator) => filterCreator())
}

function createObjectTypeFilters(
  objectTypes: ConvertedType[],
  options: {unionTypes: string[]},
): InputObjectType[] {
  return objectTypes.map((objectType) => ({
    fields: createFieldFilters(objectType, options),
    kind: 'InputObject',
    name: `${objectType.name}Filter`,
  }))
}

function createDocumentTypeFilters(
  documentTypes: ConvertedType[],
  options: {unionTypes: string[]},
): InputObjectType[] {
  return documentTypes.map((documentType) => ({
    fields: [...getDocumentFilters(), ...createFieldFilters(documentType, options)],
    kind: 'InputObject',
    name: `${documentType.name}Filter`,
  }))
}

function createFieldFilters(objectType: ConvertedType, options: {unionTypes: string[]}) {
  const {unionTypes} = options
  return objectType.fields
    .filter(
      (field) => field.type !== 'JSON' && field.kind !== 'List' && !unionTypes.includes(field.type),
    )
    .map((field) => ({
      fieldName: field.fieldName,
      isReference: field.isReference,
      type: `${typeAliases[field.type] || field.type}Filter`,
    }))
}

function getDocumentFilters() {
  return [
    {
      description: 'Apply filters on document level',
      fieldName: '_',
      type: 'DocumentFilter',
    },
  ]
}
