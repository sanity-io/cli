import {mkdir, writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'

import {exit} from '@oclif/core/errors'
import {getCliTelemetry, type Output, studioWorkerTask} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {type extractSchema as extractSchemaInternal} from '@sanity/schema/_internal'

import {SchemaExtractedTrace} from '../../telemetry/extractSchema.telemetry.js'
import {formatSchemaValidation} from './formatSchemaValidation.js'
import {type ExtractOptions} from './getExtractOptions.js'
import {type ExtractSchemaWorkerData, type ExtractSchemaWorkerError} from './types.js'
import {schemasExtractDebug} from './utils/debug.js'
import {SchemaExtractionError} from './utils/SchemaExtractionError.js'

interface ExtractSchemaActionOptions {
  extractOptions: ExtractOptions
  output: Output
}

interface ExtractSchemaWorkerResult {
  schema: ReturnType<typeof extractSchemaInternal>
  type: 'success'
}

type ExtractSchemaWorkerMessage = ExtractSchemaWorkerError | ExtractSchemaWorkerResult

export async function extractSchema(options: ExtractSchemaActionOptions): Promise<void> {
  const {extractOptions, output} = options
  const {configPath, enforceRequiredFields, format, outputPath, workspace} = extractOptions

  const spin = spinner(
    enforceRequiredFields ? 'Extracting schema with enforced required fields' : 'Extracting schema',
  ).start()

  const workDir = dirname(configPath)

  const trace = getCliTelemetry().trace(SchemaExtractedTrace)
  trace.start()

  try {
    if (format !== 'groq-type-nodes') {
      throw new Error(`Unsupported format: "${format}"`)
    }

    const result = await studioWorkerTask<ExtractSchemaWorkerMessage>(
      new URL('extractSanitySchema.worker.js', import.meta.url),
      {
        name: 'extractSanitySchema',
        studioRootPath: workDir,
        workerData: {
          configPath,
          enforceRequiredFields,
          workDir,
          workspaceName: workspace,
        } satisfies ExtractSchemaWorkerData,
      },
    )

    if (result.type === 'error') {
      throw new SchemaExtractionError(result.error, result.validation)
    }

    const schema = result.schema

    trace.log({
      enforceRequiredFields,
      schemaAllTypesCount: schema.length,
      schemaDocumentTypesCount: schema.filter((type) => type.type === 'document').length,
      schemaFormat: format,
      schemaTypesCount: schema.filter((type) => type.type === 'type').length,
    })

    const outputDir = dirname(outputPath)
    await mkdir(outputDir, {recursive: true})

    spin.text = `Writing schema to ${outputPath}`

    await writeFile(outputPath, `${JSON.stringify(schema, null, 2)}\n`)

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

    // Display validation errors if available
    if (err instanceof SchemaExtractionError && err.validation && err.validation.length > 0) {
      output.log('')
      output.log(formatSchemaValidation(err.validation))
    }

    if (err instanceof Error) {
      output.error(err.message, {exit: 1})
    }

    exit(1)
  }
}
