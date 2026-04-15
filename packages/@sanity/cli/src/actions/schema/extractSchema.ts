import {exit} from '@oclif/core/errors'
import {getCliTelemetry, type Output} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'

import {SchemaExtractedTrace} from '../../telemetry/extractSchema.telemetry.js'
import {formatSchemaValidation} from './formatSchemaValidation.js'
import {type ExtractOptions} from './getExtractOptions.js'
import {runSchemaExtraction} from './runSchemaExtraction.js'
import {schemasExtractDebug} from './utils/debug.js'
import {SchemaExtractionError} from './utils/SchemaExtractionError.js'

interface ExtractSchemaActionOptions {
  extractOptions: ExtractOptions
  output: Output
}

export async function extractSchema(options: ExtractSchemaActionOptions): Promise<void> {
  const {extractOptions, output} = options
  const {enforceRequiredFields, format, outputPath} = extractOptions

  const spin = spinner(
    enforceRequiredFields ? 'Extracting schema with enforced required fields' : 'Extracting schema',
  ).start()

  const trace = getCliTelemetry().trace(SchemaExtractedTrace)
  trace.start()

  try {
    spin.text = `Writing schema to ${outputPath}`

    const schema = await runSchemaExtraction(extractOptions)

    trace.log({
      enforceRequiredFields,
      schemaAllTypesCount: schema.length,
      schemaDocumentTypesCount: schema.filter((type) => type.type === 'document').length,
      schemaFormat: format,
      schemaTypesCount: schema.filter((type) => type.type === 'type').length,
    })

    spin.succeed(
      enforceRequiredFields
        ? `Extracted schema to ${outputPath} with enforced required fields`
        : `Extracted schema to ${outputPath}`,
    )

    trace.complete()
  } catch (err) {
    trace.error(err)
    schemasExtractDebug('Failed to extract schema', err)
    spin.fail(
      enforceRequiredFields
        ? 'Failed to extract schema with enforced required fields'
        : 'Failed to extract schema',
    )

    // Display validation errors if available and exit
    if (err instanceof SchemaExtractionError && err.validation && err.validation.length > 0) {
      output.log('')
      output.log(formatSchemaValidation(err.validation))
      exit(1)
    }

    output.error(err instanceof Error ? err.message : 'Failed to extract schema', {exit: 1})
  }
}
