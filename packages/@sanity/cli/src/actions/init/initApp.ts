import {styleText} from 'node:util'

import {type Output, type TelemetryUserProperties} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'
import {type TelemetryTrace} from '@sanity/telemetry'

import {type InitStepResult} from '../../telemetry/init.telemetry.js'
import {type EditorName} from '../mcp/editorConfigs.js'
import {getPostInitMCPPrompt} from './initHelpers.js'
import {type RepoInfo} from './remoteTemplate.js'
import {scaffoldAndInstall, selectTemplate} from './scaffoldTemplate.js'

export async function initApp({
  autoUpdates,
  defaults,
  error,
  git,
  noGit,
  mcpConfigured,
  organizationId,
  output,
  outputPath,
  overwriteFiles,
  packageManager,
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
  defaults: {projectName: string}
  error: Output['error']
  git?: boolean | string
  noGit?: boolean
  mcpConfigured: EditorName[]
  organizationId: string | undefined
  output: Output
  outputPath: string
  overwriteFiles?: boolean
  packageManager?: string
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

  await scaffoldAndInstall({
    autoUpdates,
    datasetName: '',
    defaults,
    displayName: '',
    git,
    noGit,
    organizationId,
    output,
    outputPath,
    overwriteFiles,
    packageManager,
    projectId: '',
    remoteTemplateInfo,
    sluggedName,
    templateName,
    templateToken,
    trace,
    unattended,
    useTypeScript,
    workDir,
  })

  const isCurrentDir = outputPath === process.cwd()
  const goToProjectDir = `\n(${styleText('cyan', `cd ${outputPath}`)} to navigate to your new project directory)`

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
}
