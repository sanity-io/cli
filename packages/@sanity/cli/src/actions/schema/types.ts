import {type SchemaValidationProblemGroup} from '@sanity/types'
import {z} from 'zod/mini'

export const extractSchemaWorkerData = z.object({
  configPath: z.string(),
  enforceRequiredFields: z.boolean(),
  workDir: z.string(),
  workspaceName: z.optional(z.string()),
})

export type ExtractSchemaWorkerData = z.infer<typeof extractSchemaWorkerData>

/**
 * Contains debug information about the serialized schema.
 *
 * @internal
 **/
export type SerializedSchemaDebug = {
  hoisted: Record<string, SerializedTypeDebug>
  parent?: SerializedSchemaDebug
  size: number
  types: Record<string, SerializedTypeDebug>
}

/**
 * Contains debug information about a serialized type.
 *
 * @internal
 **/
export type SerializedTypeDebug = {
  extends: string
  fields?: Record<string, SerializedTypeDebug>
  of?: Record<string, SerializedTypeDebug>
  size: number
}

/** @internal */
export interface ExtractSchemaWorkerError {
  error: string
  type: 'error'

  validation?: SchemaValidationProblemGroup[]
}

export const uniqWorkspaceWorkerDataSchema = z.object({
  configPath: z.string(),
  dataset: z.optional(z.string()),
})

export type UniqWorkspaceWorkerData = z.infer<typeof uniqWorkspaceWorkerDataSchema>

export const extractWorkspaceWorkerData = z.object({
  configPath: z.string(),
  workDir: z.string(),
})

export type ExtractWorkspaceWorkerData = z.infer<typeof extractWorkspaceWorkerData>
