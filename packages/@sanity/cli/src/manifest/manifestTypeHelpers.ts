import {
  type CrossDatasetReferenceSchemaType,
  type ObjectField,
  type ObjectSchemaType,
  type ReferenceSchemaType,
  type SchemaType,
} from '@sanity/types'

const DEFAULT_IMAGE_FIELDS = new Set(['asset', 'crop', 'hotspot', 'media'])
const DEFAULT_FILE_FIELDS = new Set(['asset', 'media'])
const DEFAULT_GEOPOINT_FIELDS = new Set(['alt', 'lat', 'lng'])
const DEFAULT_SLUG_FIELDS = new Set(['current', 'source'])

export function getCustomFields(type: ObjectSchemaType): (ObjectField & {fieldset?: string})[] {
  const fields = type.fieldsets
    ? type.fieldsets.flatMap((fs) => {
        if (fs.single) {
          return fs.field
        }
        return fs.fields.map((field) => ({
          ...field,
          fieldset: fs.name,
        }))
      })
    : type.fields

  if (isType(type, 'block')) {
    return []
  }
  if (isType(type, 'slug')) {
    return fields.filter((field) => !DEFAULT_SLUG_FIELDS.has(field.name))
  }
  if (isType(type, 'geopoint')) {
    return fields.filter((field) => !DEFAULT_GEOPOINT_FIELDS.has(field.name))
  }
  if (isType(type, 'image')) {
    return fields.filter((field) => !DEFAULT_IMAGE_FIELDS.has(field.name))
  }
  if (isType(type, 'file')) {
    return fields.filter((field) => !DEFAULT_FILE_FIELDS.has(field.name))
  }
  return fields
}

export function isReference(type: SchemaType): type is ReferenceSchemaType {
  return isType(type, 'reference')
}

export function isCrossDatasetReference(type: SchemaType): type is CrossDatasetReferenceSchemaType {
  return isType(type, 'crossDatasetReference')
}

export function isObjectField(maybeOjectField: unknown): boolean {
  return (
    typeof maybeOjectField === 'object' && maybeOjectField !== null && 'name' in maybeOjectField
  )
}

export function isCustomized(maybeCustomized: SchemaType): boolean {
  const hasFieldsArray =
    isObjectField(maybeCustomized) &&
    !isType(maybeCustomized, 'reference') &&
    !isType(maybeCustomized, 'crossDatasetReference') &&
    'fields' in maybeCustomized &&
    Array.isArray(maybeCustomized.fields)

  if (!hasFieldsArray) {
    return false
  }

  const fields = getCustomFields(maybeCustomized)
  return fields.length > 0
}

export function isType(schemaType: SchemaType, typeName: string): boolean {
  if (schemaType.name === typeName) {
    return true
  }
  if (!schemaType.type) {
    return false
  }
  return isType(schemaType.type, typeName)
}

export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

export function isPrimitive(value: unknown): value is boolean | number | string {
  return isString(value) || isBoolean(value) || isNumber(value)
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'boolean'
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'number'
}
