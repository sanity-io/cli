import {type CliConfig, type Output, type ProjectRootResult} from '@sanity/cli-core'
import {z} from 'zod'

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
  outPath: z.string(),
  verbose: z.boolean(),
  workDir: z.string(),
})

export type DeployStudioSchemasAndManifestsWorkerData = z.infer<
  typeof deployStudioSchemasAndManifestsWorkerData
>
