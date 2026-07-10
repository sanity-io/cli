import {Output} from '@sanity/cli-core/types'

import {bootstrapLocalTemplate} from './bootstrapLocalTemplate.js'
import {bootstrapRemoteTemplate} from './bootstrapRemoteTemplate.js'
import {type GenerateConfigOptions} from './createStudioConfig.js'
import {type RepoInfo} from './remoteTemplate.js'

interface BootstrapTemplateOptions {
  autoUpdates: boolean
  bearerToken: string | undefined
  dataset: string
  organizationId: string | undefined
  output: Output
  outputPath: string
  packageName: string
  projectId: string
  projectName: string
  remoteTemplateInfo: RepoInfo | undefined
  templateName: string

  useTypeScript: boolean
  workbench: boolean

  overwriteFiles?: boolean
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
  workbench,
}: BootstrapTemplateOptions) {
  const bootstrapVariables: GenerateConfigOptions['variables'] = {
    autoUpdates,
    dataset,
    organizationId,
    projectId,
    projectName,
    workbench,
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
