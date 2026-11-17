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

export const buildStudioSchemasAndManifestsWorkerData = z.object({
  configPath: z.string(),
  isExternal: z.boolean(),
  outPath: z.string(),
  // Kept optional for external callers (`@sanity/runtime-cli`) that still pass `projectId`.
  projectId: z.optional(z.string()),
  schemaRequired: z.boolean(),
  verbose: z.boolean(),
  workDir: z.string(),
})

export type BuildStudioSchemasAndManifestsWorkerData = z.infer<
  typeof buildStudioSchemasAndManifestsWorkerData
>
