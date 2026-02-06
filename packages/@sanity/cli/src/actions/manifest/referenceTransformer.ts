import {
  type CrossDatasetReferenceSchemaType,
  type GlobalDocumentReferenceSchemaType,
  type ReferenceSchemaType,
  type SchemaType,
} from '@sanity/types'

import {ensureCustomTitle, type SerializableProp} from './transformerUtils.js'
import {type ManifestSchemaType} from './types.js'

/**
 * Transforms a reference schema type to its manifest representation
 */
export function transformReference(
  reference: ReferenceSchemaType,
  retainCustomTypeProps: (type: SchemaType) => Record<string, SerializableProp>,
): Pick<ManifestSchemaType, 'to'> {
  return {
    to: (reference.to ?? []).map((type) => {
      return {
        ...retainCustomTypeProps(type),
        type: type.name,
      }
    }),
  }
}

/**
 * Transforms a cross-dataset reference schema type to its manifest representation
 */
export function transformCrossDatasetReference(
  reference: CrossDatasetReferenceSchemaType,
): Pick<ManifestSchemaType, 'preview' | 'to'> {
  return {
    to: (reference.to ?? []).map((crossDataset) => {
      const preview = crossDataset.preview?.select
        ? {preview: {select: crossDataset.preview.select}}
        : {}
      return {
        type: crossDataset.type,
        ...ensureCustomTitle(crossDataset.type, crossDataset.title),
        ...preview,
      }
    }),
  }
}

/**
 * Transforms a global document reference schema type to its manifest representation
 */
export function transformGlobalDocumentReference(
  reference: GlobalDocumentReferenceSchemaType,
): Pick<ManifestSchemaType, 'preview' | 'to'> {
  return {
    to: (reference.to ?? []).map((crossDataset) => {
      const preview = crossDataset.preview?.select
        ? {preview: {select: crossDataset.preview.select}}
        : {}
      return {
        type: crossDataset.type,
        ...ensureCustomTitle(crossDataset.type, crossDataset.title),
        ...preview,
      }
    }),
  }
}
