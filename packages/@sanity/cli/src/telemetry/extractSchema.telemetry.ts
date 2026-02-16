import {defineTrace} from '@sanity/telemetry'

interface SchemaExtractedTraceAttributes {
  enforceRequiredFields: boolean
  schemaAllTypesCount: number
  schemaDocumentTypesCount: number

  schemaFormat: string
  schemaTypesCount: number
}

type SchemaExtractionWatchModeAttributes =
  | {
      averageExtractionDuration: number
      extractionFailedCount: number
      extractionSuccessfulCount: number
      step: 'stopped'
      watcherDuration: number
    }
  | {
      enforceRequiredFields: boolean
      schemaFormat: string
      step: 'started'
    }

export const SchemaExtractedTrace = defineTrace<SchemaExtractedTraceAttributes>({
  description: 'Trace emitted when extracting schema',
  name: 'Schema Extracted',
  version: 0,
})

export const SchemaExtractionWatchModeTrace = defineTrace<SchemaExtractionWatchModeAttributes>({
  description: 'Trace emitted when schema extraction watch mode is run',
  name: 'Schema Extraction Watch Mode Started',
  version: 0,
})
