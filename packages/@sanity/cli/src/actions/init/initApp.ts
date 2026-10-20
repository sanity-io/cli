import {styleText} from 'node:util'

import {type Output, type TelemetryUserProperties} from '@sanity/cli-core'
import {isStaging} from '@sanity/cli-core/util'
import {logSymbols} from '@sanity/cli-core/ux'
import {type TelemetryTrace} from '@sanity/telemetry'

import {getMediaLibrariesForOrganization} from '../../services/mediaLibraries.js'
import {type InitStepResult} from '../../telemetry/init.telemetry.js'
import {getInstallCommand} from '../../util/packageManager/installPackages.js'
import {type EditorName} from '../mcp/editorConfigs.js'
import {determineMediaLibraryTemplate} from './determineMediaLibraryTemplate.js'
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
  workbench,
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
  workbench: boolean
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

  const {pkgManager} = await scaffoldAndInstall({
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
    workbench,
    workDir,
  })

  const isCurrentDir = outputPath === workDir
  const goToProjectDir = `\n(${styleText('cyan', `cd ${outputPath}`)} to navigate to your new project directory)`

  if (determineMediaLibraryTemplate(templateName)) {
    output.log(
      `${logSymbols.success} ${styleText(['green', 'bold'], 'Success!')} Your Media Library config app has been scaffolded.`,
    )
    if (!isCurrentDir) output.log(goToProjectDir)
    if (!options.install) {
      output.log(
        `\nRun ${styleText('cyan', getInstallCommand(pkgManager))} to install dependencies.`,
      )
    }
    if (organizationId) {
      output.log(`\nConfigured for organization ${styleText('cyan', organizationId)}.`)
      await warnIfNoActiveMediaLibrary(organizationId, output)
    }
    output.log(
      '\nField definitions live in `src/fields/` and are registered in `sanity.cli.ts` — see the README for the authoring rules.',
    )
    output.log('\nRefer to our documentation for a walkthrough:')
    output.log(styleText(['blue', 'underline'], 'https://www.sanity.io/docs/media-library'))
    output.log('\n')
    output.log(`Other helpful commands:`)
    output.log(`npx sanity docs browse     to open the documentation in a browser`)
    output.log(`npx sanity dev             to serve your fields to the Media Library live`)
    output.log(`npx sanity deploy          to deploy the config to your organization`)
    return
  }

  //output for custom apps here
  output.log(
    `${logSymbols.success} ${styleText(['green', 'bold'], 'Success!')} Your custom app has been scaffolded.`,
  )
  if (!isCurrentDir) output.log(goToProjectDir)
  if (!options.install) {
    output.log(`\nRun ${styleText('cyan', getInstallCommand(pkgManager))} to install dependencies.`)
  }

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

/**
 * Media Library is provisioned per organization, outside this app (in
 * Manage). Without an active library the dashboard's media area comes up
 * empty, so say so now — init is the one interactive, authenticated moment.
 * API errors (offline, no access to the org, timeout) are swallowed: this is
 * a hint, not a gate.
 */
async function warnIfNoActiveMediaLibrary(organizationId: string, output: Output): Promise<void> {
  try {
    const libraries = await getMediaLibrariesForOrganization(organizationId)
    if (libraries.length > 0) return
  } catch {
    return
  }

  const manageUrl = `${isStaging() ? 'https://sanity.work' : 'https://www.sanity.io'}/manage`
  output.warn(
    `\n${logSymbols.warning} Organization ${organizationId} has no active Media Library, ` +
      `so the dashboard's media area will be empty. Media Library is provisioned per ` +
      `organization — enable it in Manage (${manageUrl}) or learn more at ` +
      `https://www.sanity.io/docs/media-library.`,
  )
}
