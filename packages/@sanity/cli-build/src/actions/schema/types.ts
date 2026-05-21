import {type SchemaValidationProblemGroup} from '@sanity/types'
import {z} from 'zod/mini'

export const extractSchemaWorkerData = z.object({
  configPath: z.string(),
  enforceRequiredFields: z.boolean(),
  workDir: z.string(),
  workspaceName: z.optional(z.string()),
})

export type ExtractSchemaWorkerData = z.infer<typeof extractSchemaWorkerData>

/** @internal */
export interface ExtractSchemaWorkerError {
  error: string
  type: 'error'

  validation?: SchemaValidationProblemGroup[]
}
