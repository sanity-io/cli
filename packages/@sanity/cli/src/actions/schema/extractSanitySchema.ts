import {studioWorkerTask} from '@sanity/cli-core'
import {type extractSchema} from '@sanity/schema/_internal'
import {type SchemaValidationProblemGroup} from '@sanity/types'

interface ExtractSanitySchemaOptions {
  enforceRequiredFields: boolean
  workDir: string
  workspaceName: string
}

/** @internal */
interface ExtractSchemaWorkerResult {
  schema: ReturnType<typeof extractSchema>
  type: 'success'
}

/** @internal */
interface ExtractSchemaWorkerError {
  error: string
  type: 'error'

  validation?: SchemaValidationProblemGroup[]
}

/** @internal */
type ExtractSchemaWorkerMessage = ExtractSchemaWorkerError | ExtractSchemaWorkerResult

class SchemaExtractionError extends Error {
  validation?: SchemaValidationProblemGroup[]

  constructor(message: string, validation?: SchemaValidationProblemGroup[]) {
    super(message)
    this.name = 'SchemaExtractionError'
    this.validation = validation
  }
}

export async function extractSanitySchema(
  options: ExtractSanitySchemaOptions,
): Promise<ReturnType<typeof extractSchema>> {
  const {enforceRequiredFields, workDir, workspaceName} = options

  const result = await studioWorkerTask<ExtractSchemaWorkerMessage>(
    new URL('extractSanitySchema.worker.js', import.meta.url),
    {
      name: 'extractSanitySchema',
      studioRootPath: workDir,
      workerData: {configPath: workDir, enforceRequiredFields, workspaceName},
    },
  )

  if (result.type === 'error') {
    throw new SchemaExtractionError(result.error, result.validation)
  }

  return result.schema
}
