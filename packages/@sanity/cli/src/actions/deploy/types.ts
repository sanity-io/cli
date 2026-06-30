import {type CliConfig, type Output, type ProjectRootResult} from '@sanity/cli-core'
import {z} from 'zod/mini'

import {DeployCommand} from '../../commands/deploy.js'

export type DeployFlags = DeployCommand['flags']

export interface DeployAppOptions {
  cliConfig: CliConfig
  flags: DeployFlags
  output: Output
  projectRoot: ProjectRootResult
  sourceDir: string
}

export const deployStudioSchemasAndManifestsWorkerData = z.object({
  configPath: z.string(),
  // Validate and extract only — skip schema and manifest uploads
  dryRun: z.optional(z.boolean()),
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

/**
 * Per-workspace summary reported back from the schema worker,
 * used by dry runs to describe what passed validation.
 */
export interface WorkspaceSchemaSummary {
  dataset: string
  name: string
  projectId: string
  schemaTypes: number
}
