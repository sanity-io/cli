import {type Output, type TelemetryUserProperties} from '@sanity/cli-core'
import {select} from '@sanity/cli-core/ux'
import {type TelemetryTrace} from '@sanity/telemetry'

import {promptForTypeScript} from '../../prompts/init/promptForTypescript.js'
import {type InitStepResult} from '../../telemetry/init.telemetry.js'
import {installDeclaredPackages} from '../../util/packageManager/installPackages.js'
import {type PackageManager} from '../../util/packageManager/packageManagerChoice.js'
import {bootstrapTemplate} from './bootstrapTemplate.js'
import {tryGitInit} from './git.js'
import {writeStagingEnvIfNeeded} from './initHelpers.js'
import {type RepoInfo} from './remoteTemplate.js'
import {resolvePackageManager} from './resolvePackageManager.js'
import templates from './templates/index.js'
import {type ProjectTemplate} from './types.js'

interface SelectedTemplate {
  template: ProjectTemplate | undefined
  templateName: string
  useTypeScript: boolean | undefined
}

async function promptForTemplate(params: {
  template?: string
  unattended: boolean
}): Promise<string> {
  const defaultTemplate = params.unattended || params.template ? params.template || 'clean' : null
  if (defaultTemplate) {
    return defaultTemplate
  }

  return select({
    choices: [
      {
        name: 'Clean project with no predefined schema types',
        value: 'clean',
      },
      {
        name: 'Blog (schema)',
        value: 'blog',
      },
      {
        name: 'E-commerce (Shopify)',
        value: 'shopify',
      },
      {
        name: 'Movie project (schema + sample data)',
        value: 'moviedb',
      },
    ],
    message: 'Select project template',
  })
}

export async function selectTemplate({
  remoteTemplateInfo,
  template,
  trace,
  typescript,
  unattended,
}: {
  remoteTemplateInfo: RepoInfo | undefined
  template?: string
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>
  typescript?: boolean
  unattended: boolean
}): Promise<SelectedTemplate> {
  const templateName = await promptForTemplate({template, unattended})
  trace.log({
    selectedOption: templateName,
    step: 'selectProjectTemplate',
  })

  const resolvedTemplate = templates[templateName]

  let useTypeScript = typescript
  if (!remoteTemplateInfo && resolvedTemplate && resolvedTemplate.typescriptOnly === true) {
    useTypeScript = true
  } else if (!unattended && typescript === undefined) {
    useTypeScript = await promptForTypeScript()
    trace.log({
      selectedOption: useTypeScript ? 'yes' : 'no',
      step: 'useTypeScript',
    })
  }

  return {
    template: resolvedTemplate,
    templateName,
    useTypeScript,
  }
}

export async function scaffoldAndInstall({
  autoUpdates,
  datasetName,
  defaults,
  displayName,
  git,
  noGit,
  organizationId,
  output,
  outputPath,
  overwriteFiles,
  packageManager,
  projectId,
  remoteTemplateInfo,
  sluggedName,
  templateName,
  templateToken,
  trace,
  unattended,
  useTypeScript,
  workDir,
}: {
  autoUpdates: boolean
  datasetName: string
  defaults: {projectName: string}
  displayName: string
  git?: boolean | string
  noGit?: boolean
  organizationId: string | undefined
  output: Output
  outputPath: string
  overwriteFiles?: boolean
  packageManager?: string
  projectId: string
  remoteTemplateInfo: RepoInfo | undefined
  sluggedName: string
  templateName: string
  templateToken?: string
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>
  unattended: boolean
  useTypeScript: boolean | undefined
  workDir: string
}): Promise<{pkgManager: PackageManager}> {
  try {
    await bootstrapTemplate({
      autoUpdates,
      bearerToken: templateToken,
      dataset: datasetName,
      organizationId,
      output,
      outputPath,
      overwriteFiles: overwriteFiles as boolean,
      packageName: sluggedName,
      projectId,
      projectName: displayName || defaults.projectName,
      remoteTemplateInfo,
      templateName,
      useTypeScript: useTypeScript as boolean,
    })
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error(String(error), {cause: error})
  }

  const pkgManager = await resolvePackageManager({
    interactive: !unattended,
    output,
    packageManager: packageManager as PackageManager,
    targetDir: outputPath,
  })

  trace.log({
    selectedOption: pkgManager,
    step: 'selectPackageManager',
  })

  // Now for the slow part... installing dependencies
  await installDeclaredPackages(outputPath, pkgManager, {
    output,
    workDir,
  })

  const useGit = !noGit && (git === undefined || Boolean(git))
  const commitMessage = git
  await writeStagingEnvIfNeeded(output, outputPath)

  // Try initializing a git repository
  if (useGit) {
    tryGitInit(outputPath, typeof commitMessage === 'string' ? commitMessage : undefined)
  }

  return {pkgManager}
}
