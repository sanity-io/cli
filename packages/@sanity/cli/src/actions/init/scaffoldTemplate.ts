import {type Output, type TelemetryUserProperties} from '@sanity/cli-core'
import {select} from '@sanity/cli-core/ux'
import {type TelemetryTrace} from '@sanity/telemetry'

import {promptForTypeScript} from '../../prompts/init/promptForTypescript.js'
import {type InitStepResult} from '../../telemetry/init.telemetry.js'
import {installDeclaredPackages} from '../../util/packageManager/installPackages.js'
import {type PackageManager} from '../../util/packageManager/packageManagerChoice.js'
import {bootstrapTemplate} from './bootstrapTemplate.js'
import {tryGitInit} from './git.js'
import {shouldPrompt, writeStagingEnvIfNeeded} from './initHelpers.js'
import {type RepoInfo} from './remoteTemplate.js'
import {resolvePackageManager} from './resolvePackageManager.js'
import templates from './templates/index.js'
import {type InitOptions, type ProjectTemplate} from './types.js'

// ---------------------------------------------------------------------------
// Template selection
// ---------------------------------------------------------------------------

interface SelectedTemplate {
  template: ProjectTemplate | undefined
  templateName: string
  useTypeScript: boolean | undefined
}

/**
 * Prompts for (or resolves from flags) which template and TypeScript setting
 * to use. Shared by both the app and studio init flows.
 */
export async function selectTemplate(
  options: InitOptions,
  remoteTemplateInfo: RepoInfo | undefined,
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>,
): Promise<SelectedTemplate> {
  const templateName = await promptForTemplate(options)
  trace.log({
    selectedOption: templateName,
    step: 'selectProjectTemplate',
  })
  const template = templates[templateName]

  let useTypeScript = options.typescript
  if (!remoteTemplateInfo && template && template.typescriptOnly === true) {
    useTypeScript = true
  } else if (shouldPrompt(options.unattended, options.typescript)) {
    useTypeScript = await promptForTypeScript()
    trace.log({
      selectedOption: useTypeScript ? 'yes' : 'no',
      step: 'useTypeScript',
    })
  }

  return {template, templateName, useTypeScript}
}

// ---------------------------------------------------------------------------
// Scaffolding pipeline
// ---------------------------------------------------------------------------

interface ScaffoldOptions {
  // Studio-specific (empty string for apps)
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

  // From template selection
  templateName: string
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>

  useTypeScript: boolean | undefined
  workDir: string
}

interface ScaffoldResult {
  pkgManager: PackageManager
}

/**
 * Runs the shared scaffolding pipeline: bootstrap the template, install
 * dependencies, write staging env if needed, and optionally git-init.
 *
 * Used by both `initApp` and `initStudio`.
 */
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
}: ScaffoldOptions): Promise<ScaffoldResult> {
  await bootstrapTemplate({
    autoUpdates: options.autoUpdates,
    bearerToken: options.templateToken,
    dataset: datasetName,
    organizationId,
    output,
    outputPath,
    overwriteFiles: options.overwriteFiles,
    packageName: sluggedName,
    projectId,
    projectName: displayName || defaults.projectName,
    remoteTemplateInfo,
    templateName,
    useTypeScript,
  })

  const pkgManager = await resolvePackageManager({
    interactive: !options.unattended,
    output,
    packageManager: options.packageManager as PackageManager,
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

  const useGit = options.git === undefined || Boolean(options.git)
  const commitMessage = options.git
  await writeStagingEnvIfNeeded(output, outputPath)

  // Try initializing a git repository
  if (useGit) {
    tryGitInit(outputPath, typeof commitMessage === 'string' ? commitMessage : undefined)
  }

  return {pkgManager}
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function promptForTemplate(options: InitOptions): Promise<string> {
  const template = options.template

  const defaultTemplate = options.unattended || template ? template || 'clean' : null
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
