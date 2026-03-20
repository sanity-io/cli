import {styleText} from 'node:util'

import {getCliToken, subdebug, type TelemetryUserProperties} from '@sanity/cli-core'
import {confirm, logSymbols, select} from '@sanity/cli-core/ux'
import {type TelemetryTrace} from '@sanity/telemetry'

import {promptForTypeScript} from '../../prompts/init/promptForTypescript.js'
import {updateProjectInitializedAt} from '../../services/projects.js'
import {type InitStepResult} from '../../telemetry/init.telemetry.js'
import {installDeclaredPackages} from '../../util/packageManager/installPackages.js'
import {type PackageManager} from '../../util/packageManager/packageManagerChoice.js'
import {type EditorName} from '../mcp/editorConfigs.js'
import {bootstrapTemplate} from './bootstrapTemplate.js'
import {tryGitInit} from './git.js'
import {InitError} from './initError.js'
import {getPostInitMCPPrompt, shouldPrompt, writeStagingEnvIfNeeded} from './initHelpers.js'
import {type RepoInfo} from './remoteTemplate.js'
import {resolvePackageManager} from './resolvePackageManager.js'
import templates from './templates/index.js'
import {type InitContext, type InitOptions} from './types.js'

const debug = subdebug('init:studio')

interface InitStudioParams {
  datasetName: string
  defaults: {projectName: string}
  displayName: string
  isAppTemplate: boolean
  isFirstProject: boolean
  mcpConfigured: EditorName[]
  options: InitOptions
  organizationId: string | undefined
  output: InitContext['output']
  outputPath: string
  projectId: string
  remoteTemplateInfo: RepoInfo | undefined
  sluggedName: string
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>
  workDir: string
}

export async function initStudio({
  datasetName,
  defaults,
  displayName,
  isAppTemplate,
  isFirstProject,
  mcpConfigured,
  options,
  organizationId,
  output,
  outputPath,
  projectId,
  remoteTemplateInfo,
  sluggedName,
  trace,
  workDir,
}: InitStudioParams): Promise<void> {
  // Prompt for template to use
  const templateName = await promptForTemplate(options)
  trace.log({
    selectedOption: templateName,
    step: 'selectProjectTemplate',
  })
  const template = templates[templateName]
  if (!remoteTemplateInfo && !template) {
    throw new InitError(`Template "${templateName}" not found`, 1)
  }

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

  // If the template has a sample dataset, prompt the user whether or not we should import it
  const importDatasetFlag = options.importDataset
  const shouldImport =
    template?.datasetUrl &&
    (importDatasetFlag ??
      (!options.unattended && (await promptForDatasetImport(template.importPrompt))))

  trace.log({
    selectedOption: shouldImport ? 'yes' : 'no',
    step: 'importTemplateDataset',
  })

  try {
    await updateProjectInitializedAt(projectId)
  } catch (err) {
    // Non-critical update
    debug('Failed to update cliInitializedAt metadata', err)
  }

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

  // Prompt for dataset import (if a dataset is defined)
  if (shouldImport && template?.datasetUrl) {
    const token = await getCliToken()
    if (!token) {
      throw new InitError('Authentication required to import dataset', 1)
    }
    // Dynamic import to keep initAction decoupled from oclif commands.
    // TODO: consider replacing with `npx sanity dataset import` to fully decouple.
    // eslint-disable-next-line no-restricted-syntax
    const {ImportDatasetCommand} = await import('../../commands/datasets/import.js')
    await ImportDatasetCommand.run(
      [template.datasetUrl, '--project-id', projectId, '--dataset', datasetName, '--token', token],
      {
        root: outputPath,
      },
    )

    output.log('')
    output.log('If you want to delete the imported data, use')
    output.log(`  ${styleText('cyan', `npx sanity dataset delete ${datasetName}`)}`)
    output.log('and create a new clean dataset with')
    output.log(`  ${styleText('cyan', `npx sanity dataset create <name>`)}\n`)
  }

  const devCommandMap: Record<PackageManager, string> = {
    bun: 'bun dev',
    manual: 'npm run dev',
    npm: 'npm run dev',
    pnpm: 'pnpm dev',
    yarn: 'yarn dev',
  }
  const devCommand = devCommandMap[pkgManager]

  const isCurrentDir = outputPath === workDir
  const goToProjectDir = `\n(${styleText('cyan', `cd ${outputPath}`)} to navigate to your new project directory)`

  if (isAppTemplate) {
    //output for custom apps here
    output.log(
      `${logSymbols.success} ${styleText(['green', 'bold'], 'Success!')} Your custom app has been scaffolded.`,
    )
    if (!isCurrentDir) output.log(goToProjectDir)
    output.log(
      `\n${styleText('bold', 'Next')}, configure the project(s) and dataset(s) your app should work with.`,
    )
    output.log('\nGet started in `src/App.tsx`, or refer to our documentation for a walkthrough:')
    output.log(
      styleText(['blue', 'underline'], 'https://www.sanity.io/docs/app-sdk/sdk-configuration'),
    )
    if (mcpConfigured && mcpConfigured.length > 0) {
      const message = await getPostInitMCPPrompt(mcpConfigured)
      output.log(`\n${message}`)
      output.log(`\nLearn more: ${styleText('cyan', 'https://mcp.sanity.io')}`)
      output.log(
        `\nHave feedback? Tell us in the community: ${styleText('cyan', 'https://www.sanity.io/community/join')}`,
      )
    }
    output.log('\n')
    output.log(`Other helpful commands:`)
    output.log(`npx sanity docs browse     to open the documentation in a browser`)
    output.log(`npx sanity dev             to start the development server for your app`)
    output.log(`npx sanity deploy          to deploy your app`)
  } else {
    //output for Studios here
    output.log(`\u2705 ${styleText(['green', 'bold'], 'Success!')} Your Studio has been created.`)
    if (!isCurrentDir) output.log(goToProjectDir)
    output.log(
      `\nGet started by running ${styleText('cyan', devCommand)} to launch your Studio's development server`,
    )
    if (mcpConfigured && mcpConfigured.length > 0) {
      const message = await getPostInitMCPPrompt(mcpConfigured)
      output.log(`\n${message}`)
      output.log(`\nLearn more: ${styleText('cyan', 'https://mcp.sanity.io')}`)
      output.log(
        `\nHave feedback? Tell us in the community: ${styleText('cyan', 'https://www.sanity.io/community/join')}`,
      )
    }
    output.log('\n')
    output.log(`Other helpful commands:`)
    output.log(`npx sanity docs browse     to open the documentation in a browser`)
    output.log(`npx sanity manage          to open the project settings in a browser`)
    output.log(`npx sanity help            to explore the CLI manual`)
  }

  if (isFirstProject) {
    trace.log({selectedOption: 'yes', step: 'sendCommunityInvite'})

    const DISCORD_INVITE_LINK = 'https://www.sanity.io/community/join'

    output.log(`\nJoin the Sanity community: ${styleText('cyan', DISCORD_INVITE_LINK)}`)
    output.log('We look forward to seeing you there!\n')
  }
}

// ---------------------------------------------------------------------------
// Studio-specific prompt helpers
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

async function promptForDatasetImport(message?: string): Promise<boolean> {
  return confirm({
    default: true,
    message: message || 'This template includes a sample dataset, would you like to use it?',
  })
}
