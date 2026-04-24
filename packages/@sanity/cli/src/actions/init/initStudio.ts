import {styleText} from 'node:util'

import {getCliToken, type Output, subdebug, type TelemetryUserProperties} from '@sanity/cli-core'
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
import {type InitOptions} from './types.js'

const debug = subdebug('init')

async function promptForDatasetImport(message?: string): Promise<boolean> {
  return confirm({
    default: true,
    message: message || 'This template includes a sample dataset, would you like to use it?',
  })
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
}: {
  datasetName: string
  defaults: {projectName: string}
  displayName: string
  isFirstProject: boolean
  mcpConfigured: EditorName[]
  options: InitOptions
  organizationId: string | undefined
  output: Output
  outputPath: string
  projectId: string
  remoteTemplateInfo: RepoInfo | undefined
  sluggedName: string
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>
  workDir: string
}): Promise<void> {
  const {importDataset, unattended} = options
  const {
    template: resolvedTemplate,
    templateName,
    useTypeScript,
  } = await selectTemplate({
    options,
    remoteTemplateInfo,
    trace,
  })

  if (!remoteTemplateInfo && !resolvedTemplate) {
    throw new InitError(`Template "${templateName}" not found`, 1)
  }

  // If the template has a sample dataset, prompt the user whether or not we should import it
  const shouldImport =
    resolvedTemplate?.datasetUrl &&
    (importDataset ??
      (!unattended && (await promptForDatasetImport(resolvedTemplate.importPrompt))))

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
  if (shouldImport && resolvedTemplate?.datasetUrl) {
    const token = await getCliToken()
    if (!token) {
      throw new InitError('Authentication required to import dataset', 1)
    }
    // Spawn the project's own sanity binary for dataset import.
    // The full CLI is available as a project dependency after scaffoldAndInstall.
    // Using preferLocal lets execa resolve the binary cross-platform (.cmd on Windows).
    // stdio: 'inherit' means the child process prints its own output/errors directly,
    // so on failure we only need a short summary - not the full ExecaError dump.
    try {
      await execa(
        'sanity',
        [
          'dataset',
          'import',
          resolvedTemplate.datasetUrl,
          '--project-id',
          projectId,
          '--dataset',
          datasetName,
          '--token',
          token,
          '--missing',
        ],
        {
          cwd: outputPath,
          preferLocal: true,
          stdio: 'inherit',
        },
      )

      output.log('')
      output.log('If you want to delete the imported data, use')
      output.log(`  ${styleText('cyan', `npx sanity dataset delete ${datasetName}`)}`)
      output.log('and create a new clean dataset with')
      output.log(`  ${styleText('cyan', `npx sanity dataset create <name>`)}\n`)
    } catch {
      output.warn(
        'Sample dataset import failed. Your studio will work fine without it.\n' +
          `You can import it later with: ${styleText('cyan', `npx sanity dataset import ${resolvedTemplate.datasetUrl} ${datasetName}`)}`,
      )
    }
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

  if (isFirstProject) {
    trace.log({selectedOption: 'yes', step: 'sendCommunityInvite'})

    const DISCORD_INVITE_LINK = 'https://www.sanity.io/community/join'

    output.log(`\nJoin the Sanity community: ${styleText('cyan', DISCORD_INVITE_LINK)}`)
    output.log('We look forward to seeing you there!\n')
  }
}
