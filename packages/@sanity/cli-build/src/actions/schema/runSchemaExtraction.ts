import {mkdir, writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'

import {studioWorkerTask} from '@sanity/cli-core'
import {type extractSchema as extractSchemaInternal} from '@sanity/schema/_internal'

import {type ExtractOptions} from './getExtractOptions.js'
import {type ExtractSchemaWorkerData, type ExtractSchemaWorkerError} from './types.js'
import {SchemaExtractionError} from './utils/SchemaExtractionError.js'

interface ExtractSchemaWorkerResult {
  schema: ReturnType<typeof extractSchemaInternal>
  type: 'success'
}

type ExtractSchemaWorkerMessage = ExtractSchemaWorkerError | ExtractSchemaWorkerResult

/**
 * Core schema extraction logic.
 * Performs the extraction via worker and writes to file.
 * Throws SchemaExtractionError on failure.
 */
export async function runSchemaExtraction(
  extractOptions: Omit<ExtractOptions, 'watchPatterns'>,
): Promise<ReturnType<typeof extractSchemaInternal>> {
  const {configPath, enforceRequiredFields, format, outputPath, workspace} = extractOptions

  if (format !== 'groq-type-nodes') {
    throw new Error(`Unsupported format: "${format}"`)
  }

  const workDir = dirname(configPath)
  const outputDir = dirname(outputPath)

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

  // Ensure output directory exists
  await mkdir(outputDir, {recursive: true})

  // Write schema to file
  await writeFile(outputPath, `${JSON.stringify(schema, null, 2)}\n`)

  return schema
}
