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
  isString,
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
 * Original type definitions, keyed by the compiled type object.
 * The compiler replaces a missing `preview` with a guess, so the compiled
 * `preview` alone cannot say whether the definition declared one.
 */
const rawDefByType = new WeakMap<SchemaType, unknown>()

/**
 * Transforms a SchemaType to its manifest representation
 */
export function transformType(
  type: SchemaType,
  context: Context,
  rawDef?: unknown,
): ManifestSchemaType {
  if (rawDef) rawDefByType.set(type, rawDef)

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
  const rawDef = rawDefinitionFor(type, context)
  const arrayProps = type.jsonType === 'array' ? transformArrayMember(type, context) : {}

  const referenceProps = isReference(type) ? transformReference(type, retainCustomTypeProps) : {}
  const crossDatasetRefProps = isCrossDatasetReference(type)
    ? transformCrossDatasetReference(type)
    : {}
  const globalRefProps = isGlobalDocumentReference(type)
    ? transformGlobalDocumentReference(type)
    : {}

  const includeFields = type.jsonType === 'object' && Boolean(type.type) && isCustomized(type)
  const customFields = includeFields ? getCustomFields(type) : []
  rememberFieldDefinitions(rawDef, customFields, context)

  const objectFields: ObjectFields = includeFields
    ? {
        fields: customFields.map((objectField) => transformField(objectField, context)),
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
    ...transformBlockType(type, context, transformType, rawBlockSources(rawDef, context.schema)),
    ...transformPreview(type, context),
  }
}

/**
 * Only `select` is serializable: `prepare` and `component` are functions.
 * A consumer that finds `preview` can resolve title, subtitle and media from
 * the selected paths, but a `prepare` function may have reshaped them.
 * Inferred previews are left out, so `preview` exists only when the definition
 * declared one (`preview` or the deprecated `options.preview`).
 */
function transformPreview(type: SchemaType, context: Context): Pick<ManifestSchemaType, 'preview'> {
  if (type.jsonType !== 'object') return {}

  const declared = declaredPreview(rawDefinitionFor(type, context), context.schema)
  if (!declared) return {}

  const select = Object.fromEntries(
    Object.entries(previewSelect(declared, type)).filter(
      (entry): entry is [string, string] => isString(entry[1]) && entry[1] !== '',
    ),
  )
  return Object.keys(select).length > 0 ? {preview: {select}} : {}
}

/**
 * The definition that declared the preview, following references such as `{type: 'link'}`.
 * The schema compiler drops a `preview` written on a reference, so the compiled type keeps
 * the referenced type's preview and the local declaration only survives in the raw definition.
 */
function declaredPreview(def: unknown, schema: Context['schema']): unknown {
  const seen = new Set<unknown>()
  let current = def
  while (isRecord(current) && !seen.has(current)) {
    if (declaresPreview(current)) return current
    seen.add(current)
    current = referencedDefinition(current, schema)
  }
  return undefined
}

function previewSelect(declared: unknown, type: SchemaType): Record<string, unknown> {
  const fromDefinition = selectRecord(isRecord(declared) ? declared.preview : undefined)
  if (fromDefinition) return fromDefinition
  return selectRecord(type.preview) ?? {}
}

function selectRecord(preview: unknown): Record<string, unknown> | undefined {
  if (!isRecord(preview) || !isRecord(preview.select) || Array.isArray(preview.select)) {
    return undefined
  }
  return preview.select
}

function declaresPreview(def: unknown): boolean {
  if (!isRecord(def)) return false
  if (isRecord(def.preview)) return true
  return isRecord(def.options) && isRecord(def.options.preview)
}

function rawDefinitionFor(type: SchemaType, context: Context): unknown {
  const seen = new Set<SchemaType>()
  let current: SchemaType | undefined = type
  while (current && !seen.has(current)) {
    seen.add(current)
    const remembered = rawDefByType.get(current)
    if (remembered) return remembered
    // Only a registry type is looked up by name, so an inline type that shares a name with one keeps its own definition.
    if (context.schema.get(current.name) === current)
      return namedRawDef(context.schema, current.name)
    current = current.type
  }
  return undefined
}

/**
 * Follows a reference such as `{type: 'author'}` to the named definition it points at.
 */
function referencedDefinition(def: unknown, schema: Context['schema']): unknown {
  const named = isRecord(def) && isString(def.type) ? namedRawDef(schema, def.type) : undefined
  return named ?? def
}

function namedRawDef(schema: Context['schema'], name: string): unknown {
  const seen = new Set<Context['schema']>()
  let current: Context['schema'] | undefined = schema
  while (current && !seen.has(current)) {
    seen.add(current)
    const match = current._original?.types.find((typeDef) => typeDef.name === name)
    if (match) return match
    current = current.parent
  }
  return undefined
}

function rememberFieldDefinitions(
  rawDef: unknown,
  fields: Array<{name: string; type: SchemaType}>,
  context: Context,
): void {
  const rawFields = rawList(referencedDefinition(rawDef, context.schema), 'fields')
  for (const field of fields) {
    const rawField = rawFields.find((candidate) => rawName(candidate) === field.name)
    if (rawField) rawDefByType.set(field.type, referencedDefinition(rawField, context.schema))
  }
}

function rawBlockSources(
  rawDef: unknown,
  schema: Context['schema'],
): {annotations: unknown[]; inlineTypes: unknown[]} {
  const def = referencedDefinition(rawDef, schema)
  const annotations = isRecord(def) ? rawList(def.marks, 'annotations') : []
  const inlineTypes = rawList(def, 'of').filter(
    (member) => !(isRecord(member) && member.type === 'span'),
  )
  return {
    // Annotations are matched by the name the block declares, so a renamed reference such as
    // `{name: 'internalLink', type: 'link'}` keeps its own preview instead of the link type's.
    annotations,
    inlineTypes: inlineTypes.map((member) => referencedDefinition(member, schema)),
  }
}

function rawMemberAt(rawMembers: unknown[], compiledLength: number, index: number): unknown {
  return rawMembers.length === compiledLength ? rawMembers[index] : undefined
}

function rawList(def: unknown, key: 'annotations' | 'fields' | 'of'): unknown[] {
  if (!isRecord(def) || !Array.isArray(def[key])) return []
  return def[key]
}

function rawName(def: unknown): string | undefined {
  return isRecord(def) && isString(def.name) ? def.name : undefined
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
 * @internal Exported for testing purposes only
 */
export function retainSerializableProps(maybeSerializable: unknown, depth = 0): SerializableProp {
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
  const rawMembers = rawList(rawDefinitionFor(arrayMember, context), 'of')
  return {
    of: arrayMember.of.map((type, index) => {
      const rawMember = rawMemberAt(rawMembers, arrayMember.of.length, index)
      if (rawMember) rawDefByType.set(type, rawMember)

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
