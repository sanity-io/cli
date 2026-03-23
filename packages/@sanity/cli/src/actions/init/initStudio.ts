import fs from 'node:fs/promises'
import path from 'node:path'
import {styleText} from 'node:util'

import {getCliToken, subdebug, type TelemetryUserProperties} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {type TelemetryTrace} from '@sanity/telemetry'
import {execa} from 'execa'

import {updateProjectInitializedAt} from '../../services/projects.js'
import {type InitStepResult} from '../../telemetry/init.telemetry.js'
import {type PackageManager} from '../../util/packageManager/packageManagerChoice.js'
import {type EditorName} from '../mcp/editorConfigs.js'
import {InitError} from './initError.js'
import {getPostInitMCPPrompt} from './initHelpers.js'
import {type RepoInfo} from './remoteTemplate.js'
import {scaffoldAndInstall, selectTemplate} from './scaffoldTemplate.js'
import {type InitContext, type InitOptions} from './types.js'

const debug = subdebug('init:studio')

interface InitStudioParams {
  datasetName: string
  defaults: {projectName: string}
  displayName: string
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
  // Prompt for template and TypeScript
  const {template, templateName, useTypeScript} = await selectTemplate(
    options,
    remoteTemplateInfo,
    trace,
  )
  if (!remoteTemplateInfo && !template) {
    throw new InitError(`Template "${templateName}" not found`, 1)
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

  // Bootstrap, install deps, git init
  const {pkgManager} = await scaffoldAndInstall({
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
  })

  // Prompt for dataset import (if a dataset is defined)
  if (shouldImport && template?.datasetUrl) {
    const token = await getCliToken()
    if (!token) {
      throw new InitError('Authentication required to import dataset', 1)
    }

    // Spawn the project's own sanity binary for dataset import.
    // The full CLI is available as a project dependency after scaffoldAndInstall.
    const sanityBin = path.join(outputPath, 'node_modules', '.bin', 'sanity')
    try {
      await fs.access(sanityBin)
    } catch {
      throw new InitError(
        `Could not find sanity binary at "${sanityBin}". ` +
          'Dependencies may not have been installed correctly.',
      )
    }
    await execa(
      sanityBin,
      [
        'dataset',
        'import',
        template.datasetUrl,
        '--project-id',
        projectId,
        '--dataset',
        datasetName,
        '--token',
        token,
      ],
      {
        cwd: outputPath,
        stdio: 'inherit',
      },
    )

    output.log('')
    output.log('If you want to delete the imported data, use')
    output.log(`  ${styleText('cyan', `npx sanity dataset delete ${datasetName}`)}`)
    output.log('and create a new clean dataset with')
    output.log(`  ${styleText('cyan', `npx sanity dataset create <name>`)}\n`)
  }

  // Studio-specific success messages
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

async function promptForDatasetImport(message?: string): Promise<boolean> {
  return confirm({
    default: true,
    message: message || 'This template includes a sample dataset, would you like to use it?',
  })
}
