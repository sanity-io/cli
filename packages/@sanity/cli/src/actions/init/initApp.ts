import {styleText} from 'node:util'

import {type Output, type TelemetryUserProperties} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'
import {type TelemetryTrace} from '@sanity/telemetry'

import {type InitStepResult} from '../../telemetry/init.telemetry.js'
import {type EditorName} from '../mcp/editorConfigs.js'
import {InitError} from './initError.js'
import {getPostInitMCPPrompt} from './initHelpers.js'
import {type RepoInfo} from './remoteTemplate.js'
import {scaffoldAndInstall, selectTemplate} from './scaffoldTemplate.js'
import {type InitOptions} from './types.js'

export async function initApp({
  datasetName,
  defaults,
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

  await scaffoldAndInstall({
    datasetName,
    defaults,
    displayName: '',
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

  const isCurrentDir = outputPath === process.cwd()
  const goToProjectDir = `\n(${styleText('cyan', `cd ${outputPath}`)} to navigate to your new project directory)`

  //output for custom apps here
  output.log(
    `${logSymbols.success} ${styleText(['green', 'bold'], 'Success!')} Your custom app has been scaffolded.`,
  )
  if (!isCurrentDir) output.log(goToProjectDir)

  if (projectId && datasetName) {
    output.log(
      `\nConfigured with project ${styleText('cyan', projectId)} and dataset ${styleText('cyan', datasetName)}.`,
    )
    output.log(
      'Edit `src/App.tsx` to change these values or add more project / dataset pairs to your config.',
    )
  } else {
    output.log(
      `\n${styleText('bold', 'Next')}, configure the project(s) and dataset(s) your app should work with in \`src/App.tsx\`.`,
    )
  }
  output.log('\nRefer to our documentation for a walkthrough:')
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
