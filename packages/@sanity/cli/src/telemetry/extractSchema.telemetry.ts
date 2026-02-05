import {defineTrace} from '@sanity/telemetry'

interface SchemaExtractedTraceAttributes {
  enforceRequiredFields: boolean
  schemaAllTypesCount: number
  schemaDocumentTypesCount: number

  schemaFormat: string
  schemaTypesCount: number
}

export const SchemaExtractedTrace = defineTrace<SchemaExtractedTraceAttributes>({
  description: 'Trace emitted when extracting schema',
  name: 'Schema Extracted',
  version: 0,
})
