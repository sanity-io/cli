import {
  type ArraySchemaType,
  type BlockDefinition,
  type BooleanSchemaType,
  type FileSchemaType,
  type MultiFieldSet,
  type NumberSchemaType,
  type ObjectField,
  type ObjectSchemaType,
  type ReferenceSchemaType,
  type SchemaType,
  type StringSchemaType,
} from '@sanity/types'

import {transformBlockType} from './blockTypeTransformer.js'
import {
  transformCrossDatasetReference,
  transformGlobalDocumentReference,
  transformReference,
} from './referenceTransformer.js'
import {
  getCustomFields,
  getDefinedTypeName,
  isCrossDatasetReference,
  isCustomized,
  isDefined,
  isGlobalDocumentReference,
  isPrimitive,
  isRecord,
  isReference,
} from './schemaTypeHelpers.js'
import {
  type Context,
  ensureConditional,
  ensureCustomTitle,
  ensureString,
  type SerializableProp,
} from './transformerUtils.js'
import {
  type ManifestField,
  type ManifestFieldset,
  type ManifestSchemaType,
  type ManifestSerializable,
} from './types.js'
import {transformValidation} from './validationTransformer.js'

type SchemaTypeKey =
  | 'group' // we strip this from fields
  | keyof ArraySchemaType
  | keyof BlockDefinition
  | keyof BooleanSchemaType
  | keyof FileSchemaType
  | keyof NumberSchemaType
  | keyof ObjectSchemaType
  | keyof ReferenceSchemaType
  | keyof StringSchemaType

type ObjectFields = Record<string, never> | {fields: ManifestField[]}

const MAX_CUSTOM_PROPERTY_DEPTH = 5

/**
 * Transforms a SchemaType to its manifest representation
 */
export function transformType(type: SchemaType, context: Context): ManifestSchemaType {
  const typeName = type.type ? type.type.name : type.jsonType

  return {
    ...transformCommonTypeFields(type, typeName, context),
    name: type.name,
    type: typeName,
    ...ensureCustomTitle(type.name, type.title),
  }
}

/**
 * Transforms common fields shared across all schema types
 */
function transformCommonTypeFields(
  type: SchemaType & {fieldset?: string},
  typeName: string,
  context: Context,
): Omit<ManifestSchemaType, 'name' | 'title' | 'type'> {
  const arrayProps =
    typeName === 'array' && type.jsonType === 'array' ? transformArrayMember(type, context) : {}

  const referenceProps = isReference(type) ? transformReference(type, retainCustomTypeProps) : {}
  const crossDatasetRefProps = isCrossDatasetReference(type)
    ? transformCrossDatasetReference(type)
    : {}
  const globalRefProps = isGlobalDocumentReference(type)
    ? transformGlobalDocumentReference(type)
    : {}

  const objectFields: ObjectFields =
    type.jsonType === 'object' && type.type && isCustomized(type)
      ? {
          fields: getCustomFields(type).map((objectField) => transformField(objectField, context)),
        }
      : {}

  return {
    ...retainCustomTypeProps(type),
    ...transformValidation(type.validation, retainSerializableProps),
    ...ensureString('description', type.description),
    ...objectFields,
    ...arrayProps,
    ...referenceProps,
    ...crossDatasetRefProps,
    ...globalRefProps,
    ...ensureConditional('readOnly', type.readOnly),
    ...ensureConditional('hidden', type.hidden),
    ...transformFieldsets(type),
    // fieldset prop gets instrumented via getCustomFields
    ...ensureString('fieldset', type.fieldset),
    ...transformBlockType(type, context, transformType),
  }
}

/**
 * Transforms fieldsets from a schema type
 */
function transformFieldsets(
  type: SchemaType,
): Record<string, never> | {fieldsets: ManifestFieldset[]} {
  if (type.jsonType !== 'object') {
    return {}
  }
  const fieldsets = type.fieldsets
    ?.filter((fs): fs is MultiFieldSet => !fs.single)
    .map((fs) => {
      const options = isRecord(fs.options) ? {options: retainSerializableProps(fs.options)} : {}
      return {
        name: fs.name,
        ...ensureCustomTitle(fs.name, fs.title),
        ...ensureString('description', fs.description),
        ...ensureConditional('readOnly', fs.readOnly),
        ...ensureConditional('hidden', fs.hidden),
        ...options,
      }
    })

  return fieldsets?.length ? {fieldsets} : {}
}

/**
 * Retains custom type properties that should be included in the manifest
 */
function retainCustomTypeProps(type: SchemaType): Record<string, SerializableProp> {
  const manuallySerializedFields = new Set<SchemaTypeKey>([
    '__experimental_actions',
    '__experimental_formPreviewTitle',
    '__experimental_omnisearch_visibility',
    '__experimental_search',
    'components',
    'description',
    'fields',
    'fieldsets',
    //only exists on fields
    'group',
    'groups',
    'hidden',
    'icon',
    'jsonType',
    //explicitly added
    'name',
    'of',
    'orderings',
    'preview',
    'readOnly',
    'title',
    'to',
    // not serialized
    'type',
    'validation',
    // we know about these, but let them be generically handled
    // deprecated
    // rows (from text)
    // initialValue
    // options
    // crossDatasetReference props
  ])
  const typeWithoutManuallyHandledFields = Object.fromEntries(
    Object.entries(type).filter(
      ([key]) => !manuallySerializedFields.has(key as unknown as SchemaTypeKey),
    ),
  )
  return retainSerializableProps(typeWithoutManuallyHandledFields) as Record<
    string,
    SerializableProp
  >
}

/**
 * Retains serializable properties from an unknown value, recursively processing objects and arrays
 */
function retainSerializableProps(maybeSerializable: unknown, depth = 0): SerializableProp {
  if (depth > MAX_CUSTOM_PROPERTY_DEPTH) {
    return undefined
  }

  if (!isDefined(maybeSerializable)) {
    return undefined
  }

  if (isPrimitive(maybeSerializable)) {
    // cull empty strings
    if (maybeSerializable === '') {
      return undefined
    }
    return maybeSerializable
  }

  // url-schemes ect..
  if (maybeSerializable instanceof RegExp) {
    return maybeSerializable.toString()
  }

  if (Array.isArray(maybeSerializable)) {
    const arrayItems = maybeSerializable
      .map((item) => retainSerializableProps(item, depth + 1))
      .filter((item): item is ManifestSerializable => isDefined(item))
    return arrayItems.length > 0 ? arrayItems : undefined
  }

  if (isRecord(maybeSerializable)) {
    const serializableEntries = Object.entries(maybeSerializable)
      .map(([key, value]) => {
        return [key, retainSerializableProps(value, depth + 1)]
      })
      .filter(([, value]) => isDefined(value))
    return serializableEntries.length > 0 ? Object.fromEntries(serializableEntries) : undefined
  }

  return undefined
}

/**
 * Transforms an ObjectField to its manifest representation
 */
function transformField(field: ObjectField & {fieldset?: string}, context: Context): ManifestField {
  const fieldType = field.type
  const typeName = getDefinedTypeName(fieldType) ?? fieldType.name
  return {
    ...transformCommonTypeFields(fieldType, typeName, context),
    name: field.name,
    type: typeName,
    ...ensureCustomTitle(field.name, fieldType.title),
    // this prop gets added synthetically via getCustomFields
    ...ensureString('fieldset', field.fieldset),
  }
}

/**
 * Transforms array member types to their manifest representation
 */
function transformArrayMember(
  arrayMember: ArraySchemaType,
  context: Context,
): Pick<ManifestField, 'of'> {
  return {
    of: arrayMember.of.map((type) => {
      const typeName = getDefinedTypeName(type) ?? type.name
      return {
        ...transformCommonTypeFields(type, typeName, context),
        type: typeName,
        ...(typeName === type.name ? {} : {name: type.name}),
        ...ensureCustomTitle(type.name, type.title),
      }
    }),
  }
}
