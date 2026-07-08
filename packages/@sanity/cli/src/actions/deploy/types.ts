import {z} from 'zod/mini'

export const deployStudioSchemasAndManifestsWorkerData = z.object({
  configPath: z.string(),
  isExternal: z.boolean(),
  outPath: z.string(),
  projectId: z.string(),
  schemaRequired: z.boolean(),
  verbose: z.boolean(),
  workDir: z.string(),
})

export type DeployStudioSchemasAndManifestsWorkerData = z.infer<
  typeof deployStudioSchemasAndManifestsWorkerData
>
