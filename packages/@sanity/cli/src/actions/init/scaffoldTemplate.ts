import {type Output, type TelemetryUserProperties} from '@sanity/cli-core'
import {select} from '@sanity/cli-core/ux'
import {type TelemetryTrace} from '@sanity/telemetry'

import {promptForTypeScript} from '../../prompts/init/promptForTypescript.js'
import {type InitStepResult} from '../../telemetry/init.telemetry.js'
import {installDeclaredPackages} from '../../util/packageManager/installPackages.js'
import {type PackageManager} from '../../util/packageManager/packageManagerChoice.js'
import {bootstrapTemplate} from './bootstrapTemplate.js'
import {tryGitInit} from './git.js'
import {flagOrDefault, shouldPrompt, writeStagingEnvIfNeeded} from './initHelpers.js'
import {type RepoInfo} from './remoteTemplate.js'
import {resolvePackageManager} from './resolvePackageManager.js'
import templates from './templates/index.js'
import {type InitOptions, type ProjectTemplate} from './types.js'

interface SelectedTemplate {
  template: ProjectTemplate | undefined
  templateName: string
  useTypeScript: boolean
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
  options,
  remoteTemplateInfo,
  trace,
}: {
  options: InitOptions
  remoteTemplateInfo: RepoInfo | undefined
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>
}): Promise<SelectedTemplate> {
  const {template, typescript, unattended} = options
  const templateName = await promptForTemplate({template, unattended})
  trace.log({
    selectedOption: templateName,
    step: 'selectProjectTemplate',
  })

  const resolvedTemplate = templates[templateName]

  let useTypeScript = flagOrDefault(typescript, true)
  if (!remoteTemplateInfo && resolvedTemplate && resolvedTemplate.typescriptOnly === true) {
    useTypeScript = true
  } else if (shouldPrompt(unattended, typescript)) {
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
  datasetName,
  defaults,
  displayName,
  options,
  organizationId,
  output,
  outputPath,
  projectId,
  remoteTemplateInfo,
  sluggedName,
  templateName,
  trace,
  useTypeScript,
  workDir,
}: {
  datasetName: string
  defaults: {projectName: string}
  displayName: string
  options: InitOptions
  organizationId: string | undefined
  output: Output
  outputPath: string
  projectId: string
  remoteTemplateInfo: RepoInfo | undefined
  sluggedName: string
  templateName: string
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>
  useTypeScript: boolean
  workDir: string
}): Promise<{pkgManager: PackageManager}> {
  const {autoUpdates, git, overwriteFiles, packageManager, templateToken, unattended} = options
  const noGit = typeof git === 'boolean' && !git ? true : undefined

  await bootstrapTemplate({
    autoUpdates,
    bearerToken: templateToken,
    dataset: datasetName,
    organizationId,
    output,
    outputPath,
    overwriteFiles,
    packageName: sluggedName,
    projectId,
    projectName: displayName || defaults.projectName,
    remoteTemplateInfo,
    templateName,
    useTypeScript,
  })

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
