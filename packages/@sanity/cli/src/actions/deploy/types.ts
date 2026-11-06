import {type CliConfig, type Output, type ProjectRootResult} from '@sanity/cli-core'
import {type SerializedErrorCause} from '@sanity/cli-core/errors'
import {type SchemaValidationProblemGroup} from '@sanity/types'
import {type StudioManifest} from 'sanity'
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

/** Message posted back to the parent thread by `deployStudioSchemasAndManifests.worker.ts`. */
export type DeployStudioSchemasAndManifestsWorkerMessage =
  | {
      causes?: SerializedErrorCause[]
      error: string
      type: 'error'
      validation?: SchemaValidationProblemGroup[]
    }
  | {
      studioManifest: StudioManifest | null
      type: 'success'
    }
