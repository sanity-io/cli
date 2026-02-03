import {mkdir, writeFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'

import {exit} from '@oclif/core/errors'
import {
  getCliTelemetry,
  type Output,
  type ProjectRootResult,
  studioWorkerTask,
} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {type extractSchema as extractSchemaInternal} from '@sanity/schema/_internal'
import {type SchemaValidationProblemGroup} from '@sanity/types'

import {type ExtractSchemaCommand} from '../../commands/schema/extract'
import {SchemaExtractedTrace} from '../../telemetry/extractSchema.telemetry.js'
import {formatSchemaValidation} from './formatSchemaValidation.js'
import {type ExtractSchemaWorkerData} from './types.js'
import {schemasExtractDebug} from './utils/debug.js'

const FILENAME = 'schema.json'

class SchemaExtractionError extends Error {
  validation?: SchemaValidationProblemGroup[]

  constructor(message: string, validation?: SchemaValidationProblemGroup[]) {
    super(message)
    this.name = 'SchemaExtractionError'
    this.validation = validation
  }
}

interface ExtractSchemaOptions {
  flags: ExtractSchemaCommand['flags']
  output: Output
  projectRoot: ProjectRootResult
}

interface ExtractSchemaWorkerResult {
  schema: ReturnType<typeof extractSchemaInternal>
  type: 'success'
}

/** @internal */
interface ExtractSchemaWorkerError {
  error: string
  type: 'error'

  validation?: SchemaValidationProblemGroup[]
}

type ExtractSchemaWorkerMessage = ExtractSchemaWorkerError | ExtractSchemaWorkerResult

export async function extractSchema(options: ExtractSchemaOptions): Promise<void> {
  const {flags, output, projectRoot} = options
  const {
    'enforce-required-fields': enforceRequiredFields,
    format,
    path,
    workspace: workspaceName,
  } = flags
  const spin = spinner(
    enforceRequiredFields ? 'Extracting schema with enforced required fields' : 'Extracting schema',
  ).start()

  const workDir = projectRoot.directory

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
          configPath: projectRoot.path,
          enforceRequiredFields,
          workDir,
          workspaceName,
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
      schemaFormat: flags.format || 'groq-type-nodes',
      schemaTypesCount: schema.filter((type) => type.type === 'type').length,
    })

    const outputDir = path ? resolve(join(workDir, path)) : workDir
    const outputPath = join(outputDir, FILENAME)
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
