import {styleText} from 'node:util'

import {getCliToken, type Output, subdebug, type TelemetryUserProperties} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {type TelemetryTrace} from '@sanity/telemetry'

import {ImportDatasetCommand} from '../../commands/datasets/import.js'
import {updateProjectInitializedAt} from '../../services/projects.js'
import {type InitStepResult} from '../../telemetry/init.telemetry.js'
import {type PackageManager} from '../../util/packageManager/packageManagerChoice.js'
import {type EditorName} from '../mcp/editorConfigs.js'
import {getPostInitMCPPrompt} from './initHelpers.js'
import {type RepoInfo} from './remoteTemplate.js'
import {scaffoldAndInstall, selectTemplate} from './scaffoldTemplate.js'

const debug = subdebug('init')

async function promptForDatasetImport(message?: string): Promise<boolean> {
  return confirm({
    default: true,
    message: message || 'This template includes a sample dataset, would you like to use it?',
  })
}

export async function initStudio({
  autoUpdates,
  datasetName,
  defaults,
  displayName,
  error,
  git,
  noGit,
  importDataset,
  isFirstProject,
  mcpConfigured,
  organizationId,
  output,
  outputPath,
  overwriteFiles,
  packageManager,
  projectId,
  remoteTemplateInfo,
  sluggedName,
  template,
  templateToken,
  trace,
  typescript,
  unattended,
  workDir,
}: {
  autoUpdates: boolean
  datasetName: string
  defaults: {projectName: string}
  displayName: string
  error: Output['error']
  git?: boolean | string
  noGit?: boolean
  importDataset?: boolean
  isFirstProject: boolean
  mcpConfigured: EditorName[]
  organizationId: string | undefined
  output: Output
  outputPath: string
  overwriteFiles?: boolean
  packageManager?: string
  projectId: string
  remoteTemplateInfo: RepoInfo | undefined
  sluggedName: string
  template?: string
  templateToken?: string
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>
  typescript?: boolean
  unattended: boolean
  workDir: string
}): Promise<void> {
  const {
    template: resolvedTemplate,
    templateName,
    useTypeScript,
  } = await selectTemplate({
    remoteTemplateInfo,
    template,
    trace,
    typescript,
    unattended,
  })

  if (!remoteTemplateInfo && !resolvedTemplate) {
    error(`Template "${templateName}" not found`, {exit: 1})
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
  })

  // Prompt for dataset import (if a dataset is defined)
  if (shouldImport && resolvedTemplate?.datasetUrl) {
    const token = await getCliToken()
    if (!token) {
      return error('Authentication required to import dataset', {exit: 1})
    }
    await ImportDatasetCommand.run(
      [
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

  const isCurrentDir = outputPath === process.cwd()
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
