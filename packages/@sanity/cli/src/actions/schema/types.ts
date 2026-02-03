import {z} from 'zod'

export const extractSchemaWorkerData = z.object({
  configPath: z.string(),
  enforceRequiredFields: z.boolean(),
  workDir: z.string(),
  workspaceName: z.string().optional(),
})

export type ExtractSchemaWorkerData = z.infer<typeof extractSchemaWorkerData>
