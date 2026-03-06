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

interface SchemaDeployTraceData {
  manifestDir: string
  schemaRequired: boolean

  extractManifest?: boolean
}

export const SchemaExtractedTrace = defineTrace<SchemaExtractedTraceAttributes>({
  description: 'Trace emitted when extracting schema',
  name: 'Schema Extracted',
  version: 0,
})

export const SchemaExtractionWatchModeTrace = defineTrace<SchemaExtractionWatchModeAttributes>({
  description: 'Trace emitted when schema extraction watch mode is run',
  name: 'Schema Extraction Watch Mode',
  version: 0,
})

export const SchemaDeploy = defineTrace<SchemaDeployTraceData>({
  description:
    'Schema deploy action was executed, either via sanity schema deploy or as sanity deploy',
  name: 'Schema deploy action executed',
  version: 1,
})
