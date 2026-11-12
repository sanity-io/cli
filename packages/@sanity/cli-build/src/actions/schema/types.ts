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

/**
 * Where schema descriptors are uploaded to:
 *
 * - `project`: uploaded through a project-scoped API host (`<projectId>.api.sanity.io`) using
 *   the studio's `uploadSchema`. Requires a `projectId`.
 * - `global`: uploaded through the global API host (`api.sanity.io`) using `@sanity/schema`.
 *   Not tied to a project, so no `projectId` is needed.
 */
export type SchemaUploadScope = 'global' | 'project'

const baseBuildStudioSchemasAndManifestsWorkerDataFields = {
  configPath: z.string(),
  isExternal: z.boolean(),
  outPath: z.string(),
  schemaRequired: z.boolean(),
  verbose: z.boolean(),
  workDir: z.string(),
}

export const projectBuildStudioSchemasAndManifestsWorkerData = z.object({
  ...baseBuildStudioSchemasAndManifestsWorkerDataFields,
  projectId: z.string(),
  scope: z.literal('project'),
})

export const globalBuildStudioSchemasAndManifestsWorkerData = z.object({
  ...baseBuildStudioSchemasAndManifestsWorkerDataFields,
  descriptorClaimType: z.enum(['temporary', 'permanent']),
  scope: z.literal('global'),
})

export const buildStudioSchemasAndManifestsWorkerData = z.discriminatedUnion('scope', [
  projectBuildStudioSchemasAndManifestsWorkerData,
  globalBuildStudioSchemasAndManifestsWorkerData,
])

export type ProjectBuildStudioSchemasAndManifestsWorkerData = z.infer<
  typeof projectBuildStudioSchemasAndManifestsWorkerData
>

export type GlobalBuildStudioSchemasAndManifestsWorkerData = z.infer<
  typeof globalBuildStudioSchemasAndManifestsWorkerData
>

export type BuildStudioSchemasAndManifestsWorkerData = z.infer<
  typeof buildStudioSchemasAndManifestsWorkerData
>
