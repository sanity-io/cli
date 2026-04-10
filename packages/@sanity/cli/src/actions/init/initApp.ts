import {styleText} from 'node:util'

import {subdebug, type TelemetryUserProperties} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'
import {type TelemetryTrace} from '@sanity/telemetry'

import {type InitStepResult} from '../../telemetry/init.telemetry.js'
import {type EditorName} from '../mcp/editorConfigs.js'
import {InitError} from './initError.js'
import {getPostInitMCPPrompt} from './initHelpers.js'
import {type RepoInfo} from './remoteTemplate.js'
import {scaffoldAndInstall, selectTemplate} from './scaffoldTemplate.js'
import {type InitContext, type InitOptions} from './types.js'

const debug = subdebug('init:app')

interface InitAppParams {
  defaults: {projectName: string}
  mcpConfigured: EditorName[]
  options: InitOptions
  organizationId: string | undefined
  output: InitContext['output']
  outputPath: string
  remoteTemplateInfo: RepoInfo | undefined
  sluggedName: string
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>
  workDir: string
}

export async function initApp({
  defaults,
  mcpConfigured,
  options,
  organizationId,
  output,
  outputPath,
  remoteTemplateInfo,
  sluggedName,
  trace,
  workDir,
}: InitAppParams): Promise<void> {
  debug('Scaffolding app template')

  // Prompt for template and TypeScript
  const {template, templateName, useTypeScript} = await selectTemplate(
    options,
    remoteTemplateInfo,
    trace,
  )
  if (!remoteTemplateInfo && !template) {
    throw new InitError(`Template "${templateName}" not found`, 1)
  }

  // Bootstrap, install deps, git init
  const {pkgManager} = await scaffoldAndInstall({
    datasetName: '',
    defaults,
    displayName: '',
    options,
    organizationId,
    output,
    outputPath,
    projectId: '',
    remoteTemplateInfo,
    sluggedName,
    templateName,
    trace,
    useTypeScript,
    workDir,
  })

  // App-specific success messages
  const isCurrentDir = outputPath === workDir
  const goToProjectDir = `\n(${styleText('cyan', `cd ${outputPath}`)} to navigate to your new project directory)`

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

  debug('App scaffolding complete (pkgManager=%s)', pkgManager)
}
