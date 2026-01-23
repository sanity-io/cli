import {Output} from '@sanity/cli-core'

import {bootstrapLocalTemplate} from './bootstrapLocalTemplate.js'
import {bootstrapRemoteTemplate} from './bootstrapRemoteTemplate.js'
import {type GenerateConfigOptions} from './createStudioConfig.js'
import {type RepoInfo} from './remoteTemplate.js'

export interface BootstrapTemplateOptions {
  autoUpdates: boolean
  bearerToken: string | undefined
  dataset: string
  organizationId: string | undefined
  output: Output
  outputPath: string
  overwriteFiles: boolean
  packageName: string
  projectId: string
  projectName: string
  remoteTemplateInfo: RepoInfo | undefined
  templateName: string
  useTypeScript: boolean
}

export async function bootstrapTemplate({
  autoUpdates,
  bearerToken,
  dataset,
  organizationId,
  output,
  outputPath,
  overwriteFiles,
  packageName,
  projectId,
  projectName,
  remoteTemplateInfo,
  templateName,
  useTypeScript,
}: BootstrapTemplateOptions) {
  const bootstrapVariables: GenerateConfigOptions['variables'] = {
    autoUpdates,
    dataset,
    organizationId,
    projectId,
    projectName,
  }

  if (remoteTemplateInfo) {
    return bootstrapRemoteTemplate({
      bearerToken,
      output,
      outputPath,
      packageName,
      repoInfo: remoteTemplateInfo,
      variables: bootstrapVariables,
    })
  }

  return bootstrapLocalTemplate({
    output,
    outputPath,
    overwriteFiles,
    packageName,
    templateName,
    useTypeScript,
    variables: bootstrapVariables,
  })
}
