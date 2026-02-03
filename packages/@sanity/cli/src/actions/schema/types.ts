import {z} from 'zod'

export const extractSchemaWorkerData = z.object({
  configPath: z.string(),
  enforceRequiredFields: z.boolean(),
  workDir: z.string(),
  workspaceName: z.string().optional(),
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
