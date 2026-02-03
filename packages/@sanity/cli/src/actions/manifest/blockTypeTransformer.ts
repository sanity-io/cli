import {
  type ArraySchemaType,
  type ObjectSchemaType,
  type SchemaType,
  type SpanSchemaType,
} from '@sanity/types'

import {isRecord, isString, isType} from './schemaTypeHelpers.js'
import {type Context, ensureString} from './transformerUtils.js'
import {type ManifestSchemaType, type ManifestTitledValue} from './types.js'

type TransformTypeFn = (type: SchemaType, context: Context) => ManifestSchemaType

/**
 * Transforms a block schema type (Portable Text) to its manifest representation
 */
export function transformBlockType(
  blockType: SchemaType,
  context: Context,
  transformType: TransformTypeFn,
): Pick<ManifestSchemaType, 'lists' | 'marks' | 'of' | 'styles'> | Record<string, never> {
  if (blockType.jsonType !== 'object' || !isType(blockType, 'block')) {
    return {}
  }

  const childrenField = blockType.fields?.find((field) => field.name === 'children') as
    | {type: ArraySchemaType}
    | undefined

  if (!childrenField) {
    return {}
  }
  const ofType = childrenField.type.of
  if (!ofType) {
    return {}
  }
  const spanType = ofType.find((memberType) => memberType.name === 'span') as
    | ObjectSchemaType
    | undefined
  if (!spanType) {
    return {}
  }
  const inlineObjectTypes = (ofType.filter((memberType) => memberType.name !== 'span') ||
    []) as ObjectSchemaType[]

  return {
    lists: resolveEnabledListItems(blockType),
    marks: {
      annotations: (spanType as SpanSchemaType).annotations.map((t) => transformType(t, context)),
      decorators: resolveEnabledDecorators(spanType),
    },
    of: inlineObjectTypes.map((t) => transformType(t, context)),
    styles: resolveEnabledStyles(blockType),
  }
}

/**
 * Resolves enabled styles from a block type
 */
function resolveEnabledStyles(blockType: ObjectSchemaType): ManifestTitledValue[] | undefined {
  const styleField = blockType.fields?.find((btField) => btField.name === 'style')
  return resolveTitleValueArray(styleField?.type?.options?.list)
}

/**
 * Resolves enabled decorators from a span type
 */
function resolveEnabledDecorators(spanType: ObjectSchemaType): ManifestTitledValue[] | undefined {
  return 'decorators' in spanType ? resolveTitleValueArray(spanType.decorators) : undefined
}

/**
 * Resolves enabled list items from a block type
 */
function resolveEnabledListItems(blockType: ObjectSchemaType): ManifestTitledValue[] | undefined {
  const listField = blockType.fields?.find((btField) => btField.name === 'listItem')
  return resolveTitleValueArray(listField?.type?.options?.list)
}

/**
 * Resolves an array of title/value objects
 */
function resolveTitleValueArray(possibleArray: unknown): ManifestTitledValue[] | undefined {
  if (!possibleArray || !Array.isArray(possibleArray)) {
    return undefined
  }
  const titledValues = possibleArray
    .filter(
      (d): d is {title?: string; value: string} => isRecord(d) && !!d.value && isString(d.value),
    )
    .map((item) => {
      return {
        value: item.value,
        ...ensureString('title', item.title),
      } satisfies ManifestTitledValue
    })
  if (!titledValues?.length) {
    return undefined
  }

  return titledValues
}
