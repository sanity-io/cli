import {styleText} from 'node:util'

import {type SanityOrgUser, subdebug, type TelemetryUserProperties} from '@sanity/cli-core'
import {logSymbols, spinner} from '@sanity/cli-core/ux'
import {type TelemetryTrace} from '@sanity/telemetry'
import {type Framework, frameworks} from '@vercel/frameworks'
import deburr from 'lodash-es/deburr.js'

import {promptForConfigFiles} from '../../prompts/init/nextjs.js'
import {getCliUser} from '../../services/user.js'
import {CLIInitStepCompleted, type InitStepResult} from '../../telemetry/init.telemetry.js'
import {detectFrameworkRecord} from '../../util/detectFramework.js'
import {getProjectDefaults} from '../../util/getProjectDefaults.js'
import {validateSession} from '../auth/ensureAuthenticated.js'
import {getProviderName} from '../auth/getProviderName.js'
import {login} from '../auth/login/login.js'
import {setupMCP} from '../mcp/setupMCP.js'
import {checkNextJsReactCompatibility} from './checkNextJsReactCompatibility.js'
import {determineAppTemplate} from './determineAppTemplate.js'
import {createOrAppendEnvVars} from './env/createOrAppendEnvVars.js'
import {initApp} from './initApp.js'
import {InitError} from './initError.js'
import {flagOrDefault, shouldPrompt, writeStagingEnvIfNeeded} from './initHelpers.js'
import {initNextJs} from './initNextJs.js'
import {initStudio} from './initStudio.js'
import {getPlan} from './plan/getPlan.js'
import {createProjectFromName} from './project/createProjectFromName.js'
import {getProjectDetails} from './project/getProjectDetails.js'
import {getProjectOutputPath} from './project/getProjectOutputPath.js'
import {checkIsRemoteTemplate, getGitHubRepoInfo, type RepoInfo} from './remoteTemplate.js'
import {type InitContext, type InitOptions} from './types.js'

const debug = subdebug('init')

export async function initAction(options: InitOptions, context: InitContext): Promise<void> {
  const {output, workDir} = context

  if (options.argType) {
    throw new InitError(
      options.argType === 'plugin'
        ? 'Initializing plugins through the CLI is no longer supported'
        : `Unknown init type "${options.argType}"`,
      1,
    )
  }

  const trace = context.telemetry.trace(CLIInitStepCompleted)

  if (options.reconfigure) {
    throw new InitError('--reconfigure is deprecated - manual configuration is now required', 1)
  }

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
    rootPath: workDir,
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

  const planId = await getPlan(options, output, trace)

  let envFilenameDefault = '.env'
  if (detectedFramework && detectedFramework.slug === 'nextjs') {
    envFilenameDefault = '.env.local'
  }
  const envFilename = typeof options.env === 'string' ? options.env : envFilenameDefault

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

  if (options.bare) {
    output.log(`${logSymbols.success} Below are your project details`)
    output.log('')
    output.log(`Project ID: ${styleText('cyan', projectId)}`)
    output.log(`Dataset: ${styleText('cyan', datasetName)}`)
    output.log(
      `\nYou can find your project on Sanity Manage — https://www.sanity.io/manage/project/${projectId}\n`,
    )
    trace.complete()
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

  const initFramework = initNext

  const defaults = await getProjectDefaults({isPlugin: false, workDir})

  const outputPath = await getProjectOutputPath({
    initFramework,
    outputPath: options.outputPath,
    sluggedName,
    unattended: options.unattended,
    useEnv: Boolean(options.env),
    workDir,
  })

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
    await initNextJs({
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
    trace.complete()
    return
  }

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
    trace.complete()
    return
  }

  const sharedParams = {
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
  }

  await (isAppTemplate
    ? initApp({...sharedParams, datasetName, projectId})
    : initStudio({
        ...sharedParams,
        datasetName,
        displayName,
        isFirstProject,
        projectId,
      }))

  trace.complete()
}

function checkFlagsInUnattendedMode(
  options: InitOptions,
  {isAppTemplate, isNextJs}: {isAppTemplate: boolean; isNextJs: boolean},
): void {
  debug('Unattended mode, validating required options')

  if (isAppTemplate) {
    if (!options.outputPath) {
      throw new InitError('`--output-path` must be specified in unattended mode', 1)
    }

    const hasProjectFlag = Boolean(options.project || options.projectName)

    if (!hasProjectFlag && !options.organization) {
      throw new InitError(
        'The --organization flag is required for app templates in unattended mode. ' +
          'Use --organization <id>, or pass --project <id> / --project-name <name>.',
        1,
      )
    }

    if (options.projectName && !options.organization) {
      throw new InitError('`--project-name` requires `--organization <id>` in unattended mode', 1)
    }

    return
  }

  if (!isNextJs && !options.bare && !options.outputPath) {
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
