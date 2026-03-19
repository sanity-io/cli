import {existsSync} from 'node:fs'
import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {styleText} from 'node:util'

import {
  getCliToken,
  type SanityOrgUser,
  subdebug,
  type TelemetryUserProperties,
} from '@sanity/cli-core'
import {confirm, input, logSymbols, select, Separator, spinner} from '@sanity/cli-core/ux'
import {type DatasetAclMode, isHttpError} from '@sanity/client'
import {type TelemetryTrace} from '@sanity/telemetry'
import {type Framework, frameworks} from '@vercel/frameworks'
import {execa, type Options} from 'execa'
import deburr from 'lodash-es/deburr.js'

import {ImportDatasetCommand} from '../../commands/dataset/import.js'
import {
  promptForAppendEnv,
  promptForConfigFiles,
  promptForEmbeddedStudio,
  promptForNextTemplate,
  promptForStudioPath,
} from '../../prompts/init/nextjs.js'
import {promptForTypeScript} from '../../prompts/init/promptForTypescript.js'
import {promptForDatasetName} from '../../prompts/promptForDatasetName.js'
import {promptForDefaultConfig} from '../../prompts/promptForDefaultConfig.js'
import {promptForOrganizationName} from '../../prompts/promptForOrganizationName.js'
import {createCorsOrigin, listCorsOrigins} from '../../services/cors.js'
import {createDataset as createDatasetService, listDatasets} from '../../services/datasets.js'
import {getProjectFeatures} from '../../services/getProjectFeatures.js'
import {
  createOrganization,
  listOrganizations,
  type OrganizationCreateResponse,
  type ProjectOrganization,
} from '../../services/organizations.js'
import {getPlanId, getPlanIdFromCoupon} from '../../services/plans.js'
import {createProject, listProjects, updateProjectInitializedAt} from '../../services/projects.js'
import {getCliUser} from '../../services/user.js'
import {CLIInitStepCompleted, type InitStepResult} from '../../telemetry/init.telemetry.js'
import {detectFrameworkRecord} from '../../util/detectFramework.js'
import {absolutify, validateEmptyPath} from '../../util/fsUtils.js'
import {getProjectDefaults} from '../../util/getProjectDefaults.js'
import {getSanityEnv} from '../../util/getSanityEnv.js'
import {getPeerDependencies} from '../../util/packageManager/getPeerDependencies.js'
import {
  installDeclaredPackages,
  installNewPackages,
} from '../../util/packageManager/installPackages.js'
import {
  getPartialEnvWithNpmPath,
  type PackageManager,
} from '../../util/packageManager/packageManagerChoice.js'
import {validateSession} from '../auth/ensureAuthenticated.js'
import {getProviderName} from '../auth/getProviderName.js'
import {login} from '../auth/login/login.js'
import {createDataset} from '../dataset/create.js'
import {type EditorName} from '../mcp/editorConfigs.js'
import {setupMCP} from '../mcp/setupMCP.js'
import {findOrganizationByUserName} from '../organizations/findOrganizationByUserName.js'
import {getOrganizationChoices} from '../organizations/getOrganizationChoices.js'
import {getOrganizationsWithAttachGrantInfo} from '../organizations/getOrganizationsWithAttachGrantInfo.js'
import {hasProjectAttachGrant} from '../organizations/hasProjectAttachGrant.js'
import {type OrganizationChoices} from '../organizations/types.js'
import {bootstrapTemplate} from './bootstrapTemplate.js'
import {checkNextJsReactCompatibility} from './checkNextJsReactCompatibility.js'
import {countNestedFolders} from './countNestedFolders.js'
import {determineAppTemplate} from './determineAppTemplate.js'
import {createOrAppendEnvVars} from './env/createOrAppendEnvVars.js'
import {fetchPostInitPrompt} from './fetchPostInitPrompt.js'
import {tryGitInit} from './git.js'
import {InitError} from './initError.js'
import {checkIsRemoteTemplate, getGitHubRepoInfo, type RepoInfo} from './remoteTemplate.js'
import {resolvePackageManager} from './resolvePackageManager.js'
import templates from './templates/index.js'
import {
  sanityCliTemplate,
  sanityConfigTemplate,
  sanityFolder,
  sanityStudioTemplate,
} from './templates/nextjs/index.js'
import {type InitContext, type InitOptions, type VersionedFramework} from './types.js'

const debug = subdebug('init')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shouldPrompt(unattended: boolean, flagValue: unknown): boolean {
  return !unattended && flagValue === undefined
}

function flagOrDefault(flagValue: boolean | undefined, defaultValue: boolean): boolean {
  return typeof flagValue === 'boolean' ? flagValue : defaultValue
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Core init logic, intentionally free of oclif and `\@sanity/cli-core` command
 * abstractions. Takes plain options and a minimal context object so it can be
 * called from both the oclif `InitCommand` wrapper AND the standalone
 * `create-sanity` entry point (which bundles this function directly to avoid
 * installing the full CLI).
 */
export async function initAction(options: InitOptions, context: InitContext): Promise<void> {
  const {output, workDir} = context

  // For backwards "compatibility" - we used to allow `sanity init plugin`,
  // and no longer do - but instead of printing an error about an unknown
  // _command_, we want to acknowledge that the user is trying to do something
  // that no longer exists but might have at some point in the past.
  if (options.argType) {
    throw new InitError(
      options.argType === 'plugin'
        ? 'Initializing plugins through the CLI is no longer supported'
        : `Unknown init type "${options.argType}"`,
      1,
    )
  }

  const trace = context.telemetry.trace(CLIInitStepCompleted)

  // Slightly more helpful message for removed flags rather than just saying the flag
  // does not exist.
  if (options.reconfigure) {
    throw new InitError('--reconfigure is deprecated - manual configuration is now required', 1)
  }

  // Oclif doesn't support custom exclusive error messaging
  if (options.project && options.organization) {
    throw new InitError(
      'You have specified both a project and an organization. To move a project to an organization please visit https://www.sanity.io/manage',
      1,
    )
  }

  const defaultConfig = options.datasetDefault
  let showDefaultConfigPrompt = !defaultConfig
  if (options.dataset || options.visibility || options.datasetDefault || options.unattended) {
    showDefaultConfigPrompt = false
  }

  const detectedFramework = await detectFrameworkRecord({
    frameworkList: frameworks as readonly Framework[],
    rootPath: process.cwd(),
  })
  const isNextJs = detectedFramework?.slug === 'nextjs'

  let remoteTemplateInfo: RepoInfo | undefined
  if (options.template && checkIsRemoteTemplate(options.template)) {
    remoteTemplateInfo = await getGitHubRepoInfo(options.template, options.templateToken)
  }

  if (detectedFramework && detectedFramework.slug !== 'sanity' && remoteTemplateInfo) {
    throw new InitError(
      `A remote template cannot be used with a detected framework. Detected: ${detectedFramework.name}`,
      1,
    )
  }

  const isAppTemplate = options.template ? determineAppTemplate(options.template) : false

  // Checks flags are present when in unattended mode
  if (options.unattended) {
    checkFlagsInUnattendedMode(options, {isAppTemplate, isNextJs})
  }

  trace.start()
  trace.log({
    flags: {
      bare: options.bare,
      coupon: options.coupon,
      defaultConfig,
      env: options.env,
      git: typeof options.git === 'string' ? options.git : undefined,
      plan: options.projectPlan,
      reconfigure: options.reconfigure,
      unattended: options.unattended,
    },
    step: 'start',
  })

  // Plan can be set through `--project-plan`, or implied through `--coupon`.
  // As coupons can expire and project plans might change/be removed, we need to
  // verify that the passed flags are valid. The complexity of this is hidden in the
  // below plan methods, eventually returning a plan ID or undefined if we are told to
  // use the default plan.
  const planId = await getPlan(options, output, trace)

  let envFilenameDefault = '.env'
  if (detectedFramework && detectedFramework.slug === 'nextjs') {
    envFilenameDefault = '.env.local'
  }
  const envFilename = typeof options.env === 'string' ? options.env : envFilenameDefault

  // If the user isn't already authenticated, make it so
  const {user} = await ensureAuthenticated(options, output, trace)
  if (!isAppTemplate) {
    output.log(`${logSymbols.success} Fetching existing projects`)
    output.log('')
  }

  let newProject: string | undefined
  if (options.projectName) {
    newProject = await createProjectFromName({
      coupon: options.coupon,
      createProjectName: options.projectName,
      dataset: options.dataset,
      organization: options.organization,
      planId,
      user,
      visibility: options.visibility,
    })
  }

  const {datasetName, displayName, isFirstProject, organizationId, projectId} =
    await getProjectDetails({
      coupon: options.coupon,
      dataset: options.dataset,
      datasetDefault: options.datasetDefault,
      isAppTemplate,
      newProject,
      organization: options.organization,
      output,
      planId,
      project: options.project,
      showDefaultConfigPrompt,
      trace,
      unattended: options.unattended,
      user,
      visibility: options.visibility,
    })

  // If user doesn't want to output any template code
  if (options.bare) {
    output.log(`${logSymbols.success} Below are your project details`)
    output.log('')
    output.log(`Project ID: ${styleText('cyan', projectId)}`)
    output.log(`Dataset: ${styleText('cyan', datasetName)}`)
    output.log(
      `\nYou can find your project on Sanity Manage — https://www.sanity.io/manage/project/${projectId}\n`,
    )
    return
  }

  let initNext = flagOrDefault(options.nextjsAddConfigFiles, false)
  if (isNextJs && shouldPrompt(options.unattended, options.nextjsAddConfigFiles)) {
    initNext = await promptForConfigFiles()
  }

  trace.log({
    detectedFramework: detectedFramework?.name,
    selectedOption: initNext ? 'yes' : 'no',
    step: 'useDetectedFramework',
  })

  const sluggedName = deburr(displayName.toLowerCase())
    .replaceAll(/\s+/g, '-')
    .replaceAll(/[^a-z0-9-]/g, '')

  // add more frameworks to this as we add support for them
  // this is used to skip the getProjectInfo prompt
  const initFramework = initNext

  // Gather project defaults based on environment
  const defaults = await getProjectDefaults({isPlugin: false, workDir})

  // Prompt the user for required information
  const outputPath = await getProjectOutputPath({
    initFramework,
    outputPath: options.outputPath,
    sluggedName,
    unattended: options.unattended,
    useEnv: Boolean(options.env),
    workDir,
  })

  // Set up MCP integration
  const mcpResult = await setupMCP({mode: options.mcpMode})

  trace.log({
    configuredEditors: mcpResult.configuredEditors,
    detectedEditors: mcpResult.detectedEditors,
    skipped: mcpResult.skipped,
    step: 'mcpSetup',
  })
  if (mcpResult.error) {
    trace.error(mcpResult.error)
  }
  const mcpConfigured = mcpResult.configuredEditors

  // Show checkmark for editors that were already configured
  const {alreadyConfiguredEditors} = mcpResult
  if (alreadyConfiguredEditors.length > 0) {
    const label =
      alreadyConfiguredEditors.length === 1
        ? `${alreadyConfiguredEditors[0]} already configured for Sanity MCP`
        : `${alreadyConfiguredEditors.length} editors already configured for Sanity MCP`
    spinner(label).start().succeed()
  }

  if (isNextJs) {
    await checkNextJsReactCompatibility({
      detectedFramework,
      output,
      outputPath,
    })
  }

  if (initNext) {
    await doInitNextJs({
      datasetName,
      detectedFramework,
      envFilename,
      mcpConfigured,
      options,
      output,
      projectId,
      trace,
      workDir,
    })
    return
  }

  // user wants to write environment variables to file
  if (options.env) {
    await createOrAppendEnvVars({
      envVars: {
        DATASET: datasetName,
        PROJECT_ID: projectId,
      },
      filename: envFilename,
      framework: detectedFramework,
      log: false,
      output,
      outputPath,
    })
    await writeStagingEnvIfNeeded(output, outputPath)
    // Early exit with code 0 - caller translates to this.exit(0)
    throw new InitError('', 0)
  }

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

  try {
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
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error(String(error))
  }

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

  const isCurrentDir = outputPath === process.cwd()
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

  trace.complete()
}

// ---------------------------------------------------------------------------
// Extracted private methods (now module-level functions)
// ---------------------------------------------------------------------------

function checkFlagsInUnattendedMode(
  options: InitOptions,
  {isAppTemplate, isNextJs}: {isAppTemplate: boolean; isNextJs: boolean},
): void {
  debug('Unattended mode, validating required options')

  // App templates only require --organization and --output-path
  if (isAppTemplate) {
    if (!options.outputPath) {
      throw new InitError('`--output-path` must be specified in unattended mode', 1)
    }

    if (!options.organization) {
      throw new InitError(
        'The --organization flag is required for app templates in unattended mode. ' +
          'Use --organization <id> to specify which organization to use.',
        1,
      )
    }

    return
  }

  if (!options.dataset) {
    throw new InitError('`--dataset` must be specified in unattended mode', 1)
  }

  // output-path is required in unattended mode when not using nextjs
  if (!isNextJs && !options.outputPath) {
    throw new InitError('`--output-path` must be specified in unattended mode', 1)
  }

  if (!options.project && !options.projectName) {
    throw new InitError(
      '`--project <id>` or `--project-name <name>` must be specified in unattended mode',
      1,
    )
  }

  if (options.projectName && !options.organization) {
    throw new InitError('`--project-name` requires `--organization <id>` in unattended mode', 1)
  }
}

async function createProjectFromName({
  coupon,
  createProjectName,
  dataset,
  organization,
  planId,
  user,
  visibility,
}: {
  coupon: string | undefined
  createProjectName: string
  dataset: string | undefined
  organization: string | undefined
  planId: string | undefined
  user: SanityOrgUser
  visibility: 'private' | 'public' | undefined
}): Promise<string> {
  debug('--project-name specified, creating a new project')

  let orgForCreateProjectFlag = organization

  if (!orgForCreateProjectFlag) {
    debug('no organization specified, selecting one')
    const organizations = await listOrganizations()
    orgForCreateProjectFlag = await promptUserForOrganization({
      organizations,
      user,
    })
  }

  debug('creating a new project')
  const createdProject = await createProject({
    displayName: createProjectName.trim(),
    metadata: {coupon},
    organizationId: orgForCreateProjectFlag,
    subscription: planId ? {planId} : undefined,
  })

  debug('Project with ID %s created', createdProject.projectId)
  if (dataset) {
    debug('--dataset specified, creating dataset (%s)', dataset)
    const spin = spinner('Creating dataset').start()
    await createDatasetService({
      aclMode: visibility as DatasetAclMode | undefined,
      datasetName: dataset,
      projectId: createdProject.projectId,
    })
    spin.succeed()
  }

  return createdProject.projectId
}

async function ensureAuthenticated(
  options: InitOptions,
  output: InitContext['output'],
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>,
): Promise<{user: SanityOrgUser}> {
  const user = await validateSession()

  if (user) {
    trace.log({alreadyLoggedIn: true, step: 'login'})
    output.log(
      `${logSymbols.success} You are logged in as ${user.email} using ${getProviderName(user.provider)}`,
    )
    return {user}
  }

  if (options.unattended) {
    throw new InitError(
      'Must be logged in to run this command in unattended mode, run `sanity login`',
      1,
    )
  }

  trace.log({step: 'login'})

  try {
    await login({
      output,
      telemetry: trace.newContext('login'),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new InitError(`Login failed: ${message}`, 1)
  }

  const loggedInUser = await getCliUser()

  output.log(
    `${logSymbols.success} You are logged in as ${loggedInUser.email} using ${getProviderName(loggedInUser.provider)}`,
  )
  return {user: loggedInUser}
}

async function getOrCreateDataset(opts: {
  dataset?: string
  defaultConfig: boolean | undefined
  displayName: string
  output: InitContext['output']
  projectId: string
  showDefaultConfigPrompt: boolean
  unattended: boolean
  visibility?: string
}): Promise<{
  datasetName: string
  userAction: 'create' | 'none' | 'select'
}> {
  const {dataset, visibility} = opts
  let {defaultConfig} = opts

  if (dataset && opts.unattended) {
    return {datasetName: dataset, userAction: 'none'}
  }

  const [datasets, projectFeatures] = await Promise.all([
    listDatasets(opts.projectId),
    getProjectFeatures(opts.projectId),
  ])

  if (dataset) {
    debug('User has specified dataset through a flag (%s)', dataset)
    const existing = datasets.find((ds) => ds.name === dataset)
    if (!existing) {
      debug('Specified dataset not found, creating it')
      await createDataset({
        datasetName: dataset,
        forcePublic: defaultConfig,
        output: opts.output,
        projectFeatures,
        projectId: opts.projectId,
        visibility,
      })
    }

    return {datasetName: dataset, userAction: 'none'}
  }

  if (datasets.length === 0) {
    debug('No datasets found for project, prompting for name')
    if (opts.showDefaultConfigPrompt) {
      defaultConfig = await promptForDefaultConfig()
    }
    const name = defaultConfig
      ? 'production'
      : await promptForDatasetName({
          message: 'Name of your first dataset:',
        })
    await createDataset({
      datasetName: name,
      forcePublic: defaultConfig,
      output: opts.output,
      projectFeatures,
      projectId: opts.projectId,
      visibility,
    })
    return {datasetName: name, userAction: 'create'}
  }

  debug(`User has ${datasets.length} dataset(s) already, showing list of choices`)
  const datasetChoices = datasets.map((ds) => ({value: ds.name}))

  const selected = await select({
    choices: [{name: 'Create new dataset', value: 'new'}, new Separator(), ...datasetChoices],
    message: 'Select dataset to use',
  })

  if (selected === 'new') {
    const existingDatasetNames = datasets.map((ds) => ds.name)
    debug('User wants to create a new dataset, prompting for name')
    if (opts.showDefaultConfigPrompt && !existingDatasetNames.includes('production')) {
      defaultConfig = await promptForDefaultConfig()
    }

    const newDatasetName = defaultConfig
      ? 'production'
      : await promptForDatasetName(
          {
            message: 'Dataset name:',
          },
          existingDatasetNames,
        )
    await createDataset({
      datasetName: newDatasetName,
      forcePublic: defaultConfig,
      output: opts.output,
      projectFeatures,
      projectId: opts.projectId,
      visibility,
    })
    return {datasetName: newDatasetName, userAction: 'create'}
  }

  debug(`Returning selected dataset (${selected})`)
  return {datasetName: selected, userAction: 'select'}
}

async function getOrCreateProject({
  coupon,
  newProject,
  organization,
  planId,
  project,
  unattended,
  user,
}: {
  coupon?: string
  newProject: string | undefined
  organization: string | undefined
  planId: string | undefined
  project: string | undefined
  unattended: boolean
  user: SanityOrgUser
}): Promise<{
  displayName: string
  isFirstProject: boolean
  projectId: string
  userAction: 'create' | 'select'
}> {
  const projectId = project || newProject
  let projects
  let organizations: ProjectOrganization[]

  try {
    const [allProjects, allOrgs] = await Promise.all([listProjects(), listOrganizations()])
    projects = allProjects.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
    organizations = allOrgs
  } catch (err: unknown) {
    if (unattended && projectId) {
      return {
        displayName: 'Unknown project',
        isFirstProject: false,
        projectId,
        userAction: 'select',
      }
    }
    const message = err instanceof Error ? err.message : String(err)
    throw new InitError(`Failed to communicate with the Sanity API:\n${message}`, 1)
  }

  if (projects.length === 0 && unattended) {
    throw new InitError('No projects found for current user', 1)
  }

  if (projectId) {
    const proj = projects.find((p) => p.id === projectId)
    if (!proj && !unattended) {
      throw new InitError(
        `Given project ID (${projectId}) not found, or you do not have access to it`,
        1,
      )
    }

    return {
      displayName: proj ? proj.displayName : 'Unknown project',
      isFirstProject: false,
      projectId,
      userAction: 'select',
    }
  }

  if (organization) {
    const org =
      organizations.find((o) => o.id === organization) ||
      organizations.find((o) => o.slug === organization)

    if (!org) {
      throw new InitError(
        `Given organization ID (${organization}) not found, or you do not have access to it`,
        1,
      )
    }

    if (!(await hasProjectAttachGrant(organization))) {
      throw new InitError(
        'You lack the necessary permissions to attach a project to this organization',
        1,
      )
    }
  }

  // If the user has no projects or is using a coupon (which can only be applied to new projects)
  // just ask for project details instead of showing a list of projects
  const isUsersFirstProject = projects.length === 0
  if (isUsersFirstProject || coupon) {
    debug(
      isUsersFirstProject
        ? 'No projects found for user, prompting for name'
        : 'Using a coupon - skipping project selection',
    )

    const created = await promptForProjectCreation({
      coupon,
      isUsersFirstProject,
      organizationId: organization,
      organizations,
      planId,
      user,
    })

    return {
      ...created,
      isFirstProject: isUsersFirstProject,
      userAction: 'create',
    }
  }

  debug(`User has ${projects.length} project(s) already, showing list of choices`)

  const projectChoices = projects.map((p) => ({
    name: `${p.displayName} (${p.id})`,
    value: p.id,
  }))

  const selected = await select({
    choices: [{name: 'Create new project', value: 'new'}, new Separator(), ...projectChoices],
    message: 'Create a new project or select an existing one',
  })

  if (selected === 'new') {
    debug('User wants to create a new project, prompting for name')

    const created = await promptForProjectCreation({
      coupon,
      isUsersFirstProject,
      organizationId: organization,
      organizations,
      planId,
      user,
    })

    return {
      ...created,
      isFirstProject: isUsersFirstProject,
      userAction: 'create',
    }
  }

  debug(`Returning selected project (${selected})`)
  return {
    displayName: projects.find((p) => p.id === selected)?.displayName || '',
    isFirstProject: isUsersFirstProject,
    projectId: selected,
    userAction: 'select',
  }
}

async function getPlan(
  options: InitOptions,
  output: InitContext['output'],
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>,
): Promise<string | undefined> {
  const intendedPlan = options.projectPlan
  const intendedCoupon = options.coupon

  if (intendedCoupon) {
    return verifyCoupon(intendedCoupon, options.unattended, output, trace)
  } else if (intendedPlan) {
    return verifyPlan(intendedPlan, options.unattended, output, trace)
  } else {
    return undefined
  }
}

async function getPostInitMCPPrompt(editorsNames: EditorName[]): Promise<string> {
  return fetchPostInitPrompt(new Intl.ListFormat('en').format(editorsNames))
}

async function getProjectDetails({
  coupon,
  dataset,
  datasetDefault,
  isAppTemplate,
  newProject,
  organization,
  output,
  planId,
  project,
  showDefaultConfigPrompt,
  trace,
  unattended,
  user,
  visibility,
}: {
  coupon: string | undefined
  dataset: string | undefined
  datasetDefault: boolean
  isAppTemplate: boolean
  newProject: string | undefined
  organization: string | undefined
  output: InitContext['output']
  planId: string | undefined
  project: string | undefined
  showDefaultConfigPrompt: boolean
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>
  unattended: boolean
  user: SanityOrgUser
  visibility: 'private' | 'public' | undefined
}): Promise<{
  datasetName: string
  displayName: string
  isFirstProject: boolean
  organizationId?: string
  projectId: string
  schemaUrl?: string
}> {
  if (isAppTemplate) {
    // If organization flag is provided, use it directly (skip prompt and API call)
    if (organization) {
      return {
        datasetName: '',
        displayName: '',
        isFirstProject: false,
        organizationId: organization,
        projectId: '',
      }
    }

    // Interactive mode: fetch orgs and prompt
    // Note: unattended mode without --organization is rejected by checkFlagsInUnattendedMode
    const organizations = await listOrganizations({
      includeImplicitMemberships: 'true',
      includeMembers: 'true',
    })

    const appOrganizationId = await promptUserForOrganization({
      isAppTemplate: true,
      organizations,
      user,
    })

    return {
      datasetName: '',
      displayName: '',
      isFirstProject: false,
      organizationId: appOrganizationId,
      projectId: '',
    }
  }

  debug('Prompting user to select or create a project')
  const projectResult = await getOrCreateProject({
    coupon,
    newProject,
    organization,
    planId,
    project,
    unattended,
    user,
  })
  debug(`Project with name ${projectResult.displayName} selected`)

  // Now let's pick or create a dataset
  debug('Prompting user to select or create a dataset')
  const datasetResult = await getOrCreateDataset({
    dataset,
    defaultConfig: datasetDefault || undefined,
    displayName: projectResult.displayName,
    output,
    projectId: projectResult.projectId,
    showDefaultConfigPrompt,
    unattended,
    visibility,
  })
  debug(`Dataset with name ${datasetResult.datasetName} selected`)

  trace.log({
    datasetName: datasetResult.datasetName,
    selectedOption: datasetResult.userAction,
    step: 'createOrSelectDataset',
    visibility: visibility as 'private' | 'public',
  })

  return {
    datasetName: datasetResult.datasetName,
    displayName: projectResult.displayName,
    isFirstProject: projectResult.isFirstProject,
    projectId: projectResult.projectId,
  }
}

async function getProjectOutputPath({
  initFramework,
  outputPath,
  sluggedName,
  unattended,
  useEnv,
  workDir,
}: {
  initFramework: boolean
  outputPath: string | undefined
  sluggedName: string
  unattended: boolean
  useEnv: boolean
  workDir: string
}): Promise<string> {
  const specifiedPath = outputPath && path.resolve(outputPath)
  if (unattended || specifiedPath || useEnv || initFramework) {
    return specifiedPath || workDir
  }

  const inputPath = await input({
    default: path.join(workDir, sluggedName),
    message: 'Project output path:',
    validate: validateEmptyPath,
  })

  return absolutify(inputPath)
}

async function doInitNextJs({
  datasetName,
  detectedFramework,
  envFilename,
  mcpConfigured,
  options,
  output,
  projectId,
  trace,
  workDir,
}: {
  datasetName: string
  detectedFramework: VersionedFramework | null
  envFilename: string
  mcpConfigured: EditorName[]
  options: InitOptions
  output: InitContext['output']
  projectId: string
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>
  workDir: string
}): Promise<void> {
  let useTypeScript = flagOrDefault(options.typescript, true)
  if (shouldPrompt(options.unattended, options.typescript)) {
    useTypeScript = await promptForTypeScript()
  }
  trace.log({
    selectedOption: useTypeScript ? 'yes' : 'no',
    step: 'useTypeScript',
  })

  const fileExtension = useTypeScript ? 'ts' : 'js'
  let embeddedStudio = flagOrDefault(options.nextjsEmbedStudio, true)
  if (shouldPrompt(options.unattended, options.nextjsEmbedStudio)) {
    embeddedStudio = await promptForEmbeddedStudio()
  }
  let hasSrcFolder = false

  if (embeddedStudio) {
    // find source path (app or src/app)
    const appDir = 'app'
    let srcPath = path.join(workDir, appDir)

    if (!existsSync(srcPath)) {
      srcPath = path.join(workDir, 'src', appDir)
      hasSrcFolder = true
      if (!existsSync(srcPath)) {
        try {
          await mkdir(srcPath, {recursive: true})
        } catch {
          debug('Error creating folder %s', srcPath)
        }
      }
    }

    const studioPath = options.unattended ? '/studio' : await promptForStudioPath()

    const embeddedStudioRouteFilePath = path.join(
      srcPath,
      `${studioPath}/`,
      `[[...tool]]/page.${fileExtension}x`,
    )

    // this selects the correct template string based on whether the user is using the app or pages directory and
    // replaces the ":configPath:" placeholder in the template with the correct path to the sanity.config.ts file.
    // we account for the user-defined embeddedStudioPath (default /studio) is accounted for by creating enough "../"
    // relative paths to reach the root level of the project
    await writeOrOverwrite(
      embeddedStudioRouteFilePath,
      sanityStudioTemplate.replace(
        ':configPath:',
        `${'../'.repeat(countNestedFolders(embeddedStudioRouteFilePath.slice(workDir.length)))}sanity.config`,
      ),
      workDir,
      options,
    )

    const sanityConfigPath = path.join(workDir, `sanity.config.${fileExtension}`)
    await writeOrOverwrite(
      sanityConfigPath,
      sanityConfigTemplate(hasSrcFolder)
        .replace(':route:', embeddedStudioRouteFilePath.slice(workDir.length).replace('src/', ''))
        .replace(':basePath:', studioPath),
      workDir,
      options,
    )
  }

  const sanityCliPath = path.join(workDir, `sanity.cli.${fileExtension}`)
  await writeOrOverwrite(sanityCliPath, sanityCliTemplate, workDir, options)

  let templateToUse = options.template ?? 'clean'
  if (shouldPrompt(options.unattended, options.template)) {
    templateToUse = await promptForNextTemplate()
  }

  await writeSourceFiles({
    fileExtension,
    files: sanityFolder(useTypeScript, templateToUse as 'blog' | 'clean'),
    folderPath: undefined,
    options,
    srcFolderPrefix: hasSrcFolder,
    workDir,
  })

  let appendEnv = flagOrDefault(options.nextjsAppendEnv, true)
  if (shouldPrompt(options.unattended, options.nextjsAppendEnv)) {
    appendEnv = await promptForAppendEnv(envFilename)
  }

  if (appendEnv) {
    await createOrAppendEnvVars({
      envVars: {
        DATASET: datasetName,
        PROJECT_ID: projectId,
      },
      filename: envFilename,
      framework: detectedFramework,
      log: true,
      output,
      outputPath: workDir,
    })
  }

  if (embeddedStudio) {
    const nextjsLocalDevOrigin = 'http://localhost:3000'
    const existingCorsOrigins = await listCorsOrigins(projectId)
    const hasExistingCorsOrigin = existingCorsOrigins.some(
      (item: {origin: string}) => item.origin === nextjsLocalDevOrigin,
    )
    if (!hasExistingCorsOrigin) {
      try {
        const createCorsRes = await createCorsOrigin({
          allowCredentials: true,
          origin: nextjsLocalDevOrigin,
          projectId,
        })

        output.log(
          createCorsRes.id
            ? `Added ${nextjsLocalDevOrigin} to CORS origins`
            : `Failed to add ${nextjsLocalDevOrigin} to CORS origins`,
        )
      } catch (error) {
        debug(`Error creating new CORS Origin ${nextjsLocalDevOrigin}: ${error}`)
        throw new InitError(`Failed to add ${nextjsLocalDevOrigin} to CORS origins: ${error}`, 1)
      }
    }
  }

  const chosen = await resolvePackageManager({
    interactive: !options.unattended,
    output,
    packageManager: options.packageManager as PackageManager,
    targetDir: workDir,
  })
  trace.log({selectedOption: chosen, step: 'selectPackageManager'})
  const packages = ['@sanity/vision@4', 'sanity@4', '@sanity/image-url@1', 'styled-components@6']
  if (templateToUse === 'blog') {
    packages.push('@sanity/icons')
  }
  await installNewPackages(
    {
      packageManager: chosen,
      packages,
    },
    {
      output,
      workDir,
    },
  )

  // will refactor this later
  const execOptions: Options = {
    cwd: workDir,
    encoding: 'utf8',
    env: getPartialEnvWithNpmPath(workDir),
    stdio: 'inherit',
  }

  switch (chosen) {
    case 'npm': {
      await execa('npm', ['install', '--legacy-peer-deps', 'next-sanity@11'], execOptions)
      break
    }
    case 'pnpm': {
      await execa('pnpm', ['install', 'next-sanity@11'], execOptions)
      break
    }
    case 'yarn': {
      const peerDeps = await getPeerDependencies('next-sanity@11', workDir)
      await installNewPackages(
        {packageManager: 'yarn', packages: ['next-sanity@11', ...peerDeps]},
        {output, workDir},
      )
      break
    }
    default: {
      // bun and manual - do nothing or handle differently
      break
    }
  }

  output.log(
    `\n${styleText('green', 'Success!')} Your Sanity configuration files has been added to this project`,
  )
  if (mcpConfigured && mcpConfigured.length > 0) {
    const message = await getPostInitMCPPrompt(mcpConfigured)
    output.log(`\n${message}`)
    output.log(`\nLearn more: ${styleText('cyan', 'https://mcp.sanity.io')}`)
    output.log(
      `\nHave feedback? Tell us in the community: ${styleText('cyan', 'https://www.sanity.io/community/join')}`,
    )
  }

  await writeStagingEnvIfNeeded(output, workDir)
  // Early exit with code 0 - caller translates to this.exit(0)
  throw new InitError('', 0)
}

async function promptForDatasetImport(message?: string): Promise<boolean> {
  return confirm({
    default: true,
    message: message || 'This template includes a sample dataset, would you like to use it?',
  })
}

async function promptForProjectCreation({
  coupon,
  isUsersFirstProject,
  organizationId,
  organizations,
  planId,
  user,
}: {
  coupon: string | undefined
  isUsersFirstProject: boolean
  organizationId: string | undefined
  organizations: ProjectOrganization[]
  planId: string | undefined
  user: SanityOrgUser
}): Promise<{displayName: string; isFirstProject: boolean; projectId: string}> {
  const projectName = await input({
    default: 'My Sanity Project',
    message: 'Project name:',
    validate(val) {
      if (!val || val.trim() === '') {
        return 'Project name cannot be empty'
      }

      if (val.length > 80) {
        return 'Project name cannot be longer than 80 characters'
      }

      return true
    },
  })

  const org = organizationId || (await promptUserForOrganization({organizations, user}))

  const newProjectResult = await createProject({
    displayName: projectName,
    metadata: {coupon},
    organizationId: org,
    subscription: planId ? {planId} : undefined,
  })

  return {
    ...newProjectResult,
    isFirstProject: isUsersFirstProject,
  }
}

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

async function promptUserForNewOrganization(
  user: SanityOrgUser,
): Promise<OrganizationCreateResponse> {
  const name = await promptForOrganizationName(user)

  const spin = spinner('Creating organization').start()
  const org = await createOrganization(name)
  spin.succeed()

  return org
}

async function promptUserForOrganization({
  isAppTemplate = false,
  organizations,
  user,
}: {
  isAppTemplate?: boolean
  organizations: ProjectOrganization[]
  user: SanityOrgUser
}): Promise<string | undefined> {
  // If the user has no organizations, prompt them to create one with the same name as
  // their user, but allow them to customize it if they want
  if (organizations.length === 0) {
    const newOrganization = await promptUserForNewOrganization(user)
    return newOrganization.id
  }

  let organizationChoices: OrganizationChoices
  let defaultOrganizationId: string | undefined

  if (isAppTemplate) {
    // For app templates, all organizations are valid - no attach grant check needed
    organizationChoices = getOrganizationChoices(organizations)
    defaultOrganizationId =
      organizations.length === 1
        ? organizations[0].id
        : findOrganizationByUserName(organizations, user)
  } else {
    // For studio projects, check which organizations the user can attach projects to
    debug(`User has ${organizations.length} organization(s), checking attach access`)
    const withGrantInfo = await getOrganizationsWithAttachGrantInfo(organizations)
    const withAttach = withGrantInfo.filter(({hasAttachGrant}) => hasAttachGrant)

    debug('User has attach access to %d organizations.', withAttach.length)
    organizationChoices = getOrganizationChoices(withGrantInfo)
    defaultOrganizationId =
      withAttach.length === 1
        ? withAttach[0].organization.id
        : findOrganizationByUserName(organizations, user)
  }

  const chosenOrg = await select({
    choices: organizationChoices,
    default: defaultOrganizationId || undefined,
    message: 'Select organization:',
  })

  if (chosenOrg === '-new-') {
    const newOrganization = await promptUserForNewOrganization(user)
    return newOrganization.id
  }

  return chosenOrg || undefined
}

async function verifyCoupon(
  intendedCoupon: string,
  unattended: boolean,
  output: InitContext['output'],
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>,
): Promise<string | undefined> {
  try {
    const planId = await getPlanIdFromCoupon(intendedCoupon)
    output.log(`Coupon "${intendedCoupon}" validated!\n`)
    return planId
  } catch (err: unknown) {
    if (!isHttpError(err) || err.statusCode !== 404) {
      const message = err instanceof Error ? err.message : `${err}`
      throw new InitError(`Unable to validate coupon, please try again later:\n\n${message}`, 1)
    }

    const useDefaultPlan =
      unattended ||
      (await confirm({
        default: true,
        message: `Coupon "${intendedCoupon}" is not available, use default plan instead?`,
      }))

    if (unattended) {
      output.warn(`Coupon "${intendedCoupon}" is not available - using default plan`)
    }

    trace.log({
      coupon: intendedCoupon,
      selectedOption: useDefaultPlan ? 'yes' : 'no',
      step: 'useDefaultPlanCoupon',
    })

    if (useDefaultPlan) {
      output.log('Using default plan.')
    } else {
      throw new InitError(`Coupon "${intendedCoupon}" does not exist`, 1)
    }
  }
}

async function verifyPlan(
  intendedPlan: string,
  unattended: boolean,
  output: InitContext['output'],
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>,
): Promise<string | undefined> {
  try {
    const planId = await getPlanId(intendedPlan)
    return planId
  } catch (err: unknown) {
    if (!isHttpError(err) || err.statusCode !== 404) {
      const message = err instanceof Error ? err.message : `${err}`
      throw new InitError(`Unable to validate plan, please try again later:\n\n${message}`, 1)
    }

    const useDefaultPlan =
      unattended ||
      (await confirm({
        default: true,
        message: `Project plan "${intendedPlan}" does not exist, use default plan instead?`,
      }))

    if (unattended) {
      output.warn(`Project plan "${intendedPlan}" does not exist - using default plan`)
    }

    trace.log({
      planId: intendedPlan,
      selectedOption: useDefaultPlan ? 'yes' : 'no',
      step: 'useDefaultPlanId',
    })

    if (useDefaultPlan) {
      output.log('Using default plan.')
    } else {
      throw new InitError(`Plan id "${intendedPlan}" does not exist`, 1)
    }
  }
}

async function writeOrOverwrite(
  filePath: string,
  content: string,
  workDir: string,
  options: InitOptions,
): Promise<void> {
  if (existsSync(filePath)) {
    let overwrite = flagOrDefault(options.overwriteFiles, false)
    if (shouldPrompt(options.unattended, options.overwriteFiles)) {
      overwrite = await confirm({
        default: false,
        message: `File ${styleText(
          'yellow',
          filePath.replace(workDir, ''),
        )} already exists. Do you want to overwrite it?`,
      })
    }

    if (!overwrite) {
      return
    }
  }

  // make folder if not exists
  const folderPath = path.dirname(filePath)

  try {
    await mkdir(folderPath, {recursive: true})
  } catch {
    debug('Error creating folder %s', folderPath)
  }

  await writeFile(filePath, content, {
    encoding: 'utf8',
  })
}

// write sanity folder files
async function writeSourceFiles({
  fileExtension,
  files,
  folderPath,
  options,
  srcFolderPrefix,
  workDir,
}: {
  fileExtension: string
  files: Record<string, Record<string, string> | string>
  folderPath?: string
  options: InitOptions
  srcFolderPrefix?: boolean
  workDir: string
}): Promise<void> {
  for (const [filePath, content] of Object.entries(files)) {
    // check if file ends with full stop to indicate it's file and not directory (this only works with our template tree structure)
    if (filePath.includes('.') && typeof content === 'string') {
      await writeOrOverwrite(
        path.join(
          workDir,
          srcFolderPrefix ? 'src' : '',
          'sanity',
          folderPath || '',
          `${filePath}${fileExtension}`,
        ),
        content,
        workDir,
        options,
      )
    } else {
      await mkdir(path.join(workDir, srcFolderPrefix ? 'src' : '', 'sanity', filePath), {
        recursive: true,
      })
      if (typeof content === 'object') {
        await writeSourceFiles({
          fileExtension,
          files: content,
          folderPath: filePath,
          options,
          srcFolderPrefix,
          workDir,
        })
      }
    }
  }
}

/**
 * When running in a non-production Sanity environment (e.g. staging), write the
 * `SANITY_INTERNAL_ENV` variable to a `.env` file in the output directory so that
 * the bootstrapped project continues to target the same environment.
 */
async function writeStagingEnvIfNeeded(
  output: InitContext['output'],
  outputPath: string,
): Promise<void> {
  const sanityEnv = getSanityEnv()
  if (sanityEnv === 'production') return

  await createOrAppendEnvVars({
    envVars: {INTERNAL_ENV: sanityEnv},
    filename: '.env',
    framework: null,
    log: false,
    output,
    outputPath,
  })
}
