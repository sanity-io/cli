import path from 'node:path'
import {styleText} from 'node:util'

import {Args, Command, Flags} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {
  SanityCommand,
  type SanityOrgUser,
  subdebug,
  type TelemetryUserProperties,
} from '@sanity/cli-core'
import {confirm, input, logSymbols, select, Separator, spinner} from '@sanity/cli-core/ux'
import {type DatasetAclMode, isHttpError} from '@sanity/client'
import {type TelemetryTrace} from '@sanity/telemetry'
import {type Framework, frameworks} from '@vercel/frameworks'
import deburr from 'lodash-es/deburr.js'

import {validateSession} from '../actions/auth/ensureAuthenticated.js'
import {getProviderName} from '../actions/auth/getProviderName.js'
import {login} from '../actions/auth/login/login.js'
import {createDataset} from '../actions/dataset/create.js'
import {checkNextJsReactCompatibility} from '../actions/init/checkNextJsReactCompatibility.js'
import {determineAppTemplate} from '../actions/init/determineAppTemplate.js'
import {createOrAppendEnvVars} from '../actions/init/env/createOrAppendEnvVars.js'
import {initApp} from '../actions/init/initApp.js'
import {flagOrDefault, shouldPrompt, writeStagingEnvIfNeeded} from '../actions/init/initHelpers.js'
import {initNextJs} from '../actions/init/initNextJs.js'
import {initStudio} from '../actions/init/initStudio.js'
import {
  checkIsRemoteTemplate,
  getGitHubRepoInfo,
  type RepoInfo,
} from '../actions/init/remoteTemplate.js'
import {setupMCP} from '../actions/mcp/setupMCP.js'
import {findOrganizationByUserName} from '../actions/organizations/findOrganizationByUserName.js'
import {getOrganizationChoices} from '../actions/organizations/getOrganizationChoices.js'
import {getOrganizationsWithAttachGrantInfo} from '../actions/organizations/getOrganizationsWithAttachGrantInfo.js'
import {hasProjectAttachGrant} from '../actions/organizations/hasProjectAttachGrant.js'
import {type OrganizationChoices} from '../actions/organizations/types.js'
import {promptForConfigFiles} from '../prompts/init/nextjs.js'
import {promptForDatasetName} from '../prompts/promptForDatasetName.js'
import {promptForDefaultConfig} from '../prompts/promptForDefaultConfig.js'
import {promptForOrganizationName} from '../prompts/promptForOrganizationName.js'
import {createDataset as createDatasetService, listDatasets} from '../services/datasets.js'
import {getProjectFeatures} from '../services/getProjectFeatures.js'
import {
  createOrganization,
  listOrganizations,
  type OrganizationCreateResponse,
  type ProjectOrganization,
} from '../services/organizations.js'
import {getPlanId, getPlanIdFromCoupon} from '../services/plans.js'
import {createProject, listProjects} from '../services/projects.js'
import {getCliUser} from '../services/user.js'
import {CLIInitStepCompleted, type InitStepResult} from '../telemetry/init.telemetry.js'
import {detectFrameworkRecord} from '../util/detectFramework.js'
import {absolutify, validateEmptyPath} from '../util/fsUtils.js'
import {getProjectDefaults} from '../util/getProjectDefaults.js'
import {getSanityEnv} from '../util/getSanityEnv.js'

const debug = subdebug('init')

export class InitCommand extends SanityCommand<typeof InitCommand> {
  static override args = {type: Args.string({hidden: true})}
  static override description = 'Initialize a new Sanity Studio, project and/or app'
  static override enableJsonFlag = true

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    {
      command: '<%= config.bin %> <%= command.id %> --dataset-default',
      description: 'Initialize a new project with a public dataset named "production"',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> -y --project abc123 --dataset production --output-path ~/myproj',
      description: 'Initialize a project with the given project ID and dataset to the given path',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> -y --project abc123 --dataset staging --template moviedb --output-path .',
      description:
        'Initialize a project with the given project ID and dataset using the moviedb template to the given path',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> -y --project-name "Movies Unlimited" --dataset moviedb --visibility private --template moviedb --output-path /Users/espenh/movies-unlimited',
      description: 'Create a brand new project with name "Movies Unlimited"',
    },
  ] satisfies Array<Command.Example>

  static override flags = {
    'auto-updates': Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Enable auto updates of studio versions',
      exclusive: ['bare'],
    }),
    bare: Flags.boolean({
      description:
        'Skip the Studio initialization and only print the selected project ID and dataset name to stdout',
    }),
    coupon: Flags.string({
      description:
        'Optionally select a coupon for a new project (cannot be used with --project-plan)',
      exclusive: ['project-plan'],
      helpValue: '<code>',
    }),
    'create-project': Flags.string({
      deprecated: {message: 'Use --project-name instead'},
      description: 'Create a new project with the given name',
      helpValue: '<name>',
      hidden: true,
    }),
    dataset: Flags.string({
      description: 'Dataset name for the studio',
      exclusive: ['dataset-default'],
      helpValue: '<name>',
    }),
    'dataset-default': Flags.boolean({
      description: 'Set up a project with a public dataset named "production"',
    }),
    env: Flags.string({
      description: 'Write environment variables to file',
      exclusive: ['bare'],
      helpValue: '<filename>',
      parse: async (input) => {
        if (!input.startsWith('.env')) {
          throw new CLIError('Env filename (`--env`) must start with `.env`')
        }
        return input
      },
    }),
    'from-create': Flags.boolean({
      description: 'Internal flag to indicate that the command is run from create-sanity',
      hidden: true,
    }),
    git: Flags.string({
      default: undefined,
      description: 'Specify a commit message for initial commit, or disable git init',
      exclusive: ['bare'],
      // oclif doesn't indent correctly with custom help labels, thus leading space :/
      helpLabel: '    --[no-]git',
      helpValue: '<message>',
    }),
    'import-dataset': Flags.boolean({
      allowNo: true,
      default: undefined,
      description: 'Import template sample dataset',
    }),
    mcp: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Enable AI editor integration (MCP) setup',
    }),
    'nextjs-add-config-files': Flags.boolean({
      allowNo: true,
      default: undefined,
      description: 'Add config files to Next.js project',
      helpGroup: 'Next.js',
    }),
    'nextjs-append-env': Flags.boolean({
      allowNo: true,
      default: undefined,
      description: 'Append project ID and dataset to .env file',
      helpGroup: 'Next.js',
    }),
    'nextjs-embed-studio': Flags.boolean({
      allowNo: true,
      default: undefined,
      description: 'Embed the Studio in Next.js application',
      helpGroup: 'Next.js',
    }),
    // oclif doesn't support a boolean/string flag combination, but listing both a
    // `--git` and a `--no-git` flag in help breaks conventions, so we hide this one,
    // but use it to "combine" the two in the actual logic.
    'no-git': Flags.boolean({
      description: 'Disable git initialization',
      exclusive: ['git'],
      hidden: true,
    }),
    organization: Flags.string({
      description: 'Organization ID to use for the project',
      helpValue: '<id>',
    }),
    'output-path': Flags.string({
      description: 'Path to write studio project to',
      exclusive: ['bare'],
      helpValue: '<path>',
    }),
    'overwrite-files': Flags.boolean({
      allowNo: true,
      default: undefined,
      description: 'Overwrite existing files',
    }),
    'package-manager': Flags.string({
      description: 'Specify which package manager to use [allowed: npm, yarn, pnpm]',
      exclusive: ['bare'],
      helpValue: '<manager>',
      options: ['npm', 'yarn', 'pnpm'],
    }),
    project: Flags.string({
      aliases: ['project-id'],
      description: 'Project ID to use for the studio',
      exclusive: ['create-project', 'project-name'],
      helpValue: '<id>',
    }),
    'project-name': Flags.string({
      description: 'Create a new project with the given name',
      exclusive: ['project', 'create-project'],
      helpValue: '<name>',
    }),
    'project-plan': Flags.string({
      description: 'Optionally select a plan for a new project',
      helpValue: '<name>',
    }),
    provider: Flags.string({
      description: 'Login provider to use',
      helpValue: '<provider>',
    }),
    quickstart: Flags.boolean({
      deprecated: true,
      description:
        'Used for initializing a project from a server schema that is saved in the Journey API',
      hidden: true,
    }),
    reconfigure: Flags.boolean({
      deprecated: {
        message: 'This flag is no longer supported',
        version: '3.0.0',
      },
      description: 'Reconfigure an existing project',
      hidden: true,
    }),
    template: Flags.string({
      description: 'Project template to use [default: "clean"]',
      exclusive: ['bare'],
      helpValue: '<template>',
    }),
    // Porting over a beta flag
    // Oclif doesn't seem to support something in beta so hiding for now
    'template-token': Flags.string({
      description: 'Used for accessing private GitHub repo templates',
      hidden: true,
    }),
    typescript: Flags.boolean({
      allowNo: true,
      default: undefined,
      description: 'Enable TypeScript support',
      exclusive: ['bare'],
    }),
    visibility: Flags.string({
      description: 'Visibility mode for dataset',
      helpValue: '<mode>',
      options: ['public', 'private'],
    }),
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description:
        'Unattended mode, answers "yes" to any "yes/no" prompt and otherwise uses defaults',
    }),
  }

  _trace!: TelemetryTrace<TelemetryUserProperties, InitStepResult>

  public async run(): Promise<void> {
    const workDir = process.cwd()

    const createProjectName = this.flags['project-name'] ?? this.flags['create-project']
    // For backwards "compatibility" - we used to allow `sanity init plugin`,
    // and no longer do - but instead of printing an error about an unknown
    // _command_, we want to acknowledge that the user is trying to do something
    // that no longer exists but might have at some point in the past.
    if (this.args.type) {
      this.error(
        this.args.type === 'plugin'
          ? 'Initializing plugins through the CLI is no longer supported'
          : `Unknown init type "${this.args.type}"`,
        {exit: 1},
      )
    }

    this._trace = this.telemetry.trace(CLIInitStepCompleted)

    // Slightly more helpful message for removed flags rather than just saying the flag
    // does not exist.
    if (this.flags.reconfigure) {
      this.error('--reconfigure is deprecated - manual configuration is now required', {exit: 1})
    }

    // Oclif doesn't support custom exclusive error messaging
    if (this.flags.project && this.flags.organization) {
      this.error(
        'You have specified both a project and an organization. To move a project to an organization please visit https://www.sanity.io/manage',
        {exit: 1},
      )
    }

    const defaultConfig = this.flags['dataset-default']
    let showDefaultConfigPrompt = !defaultConfig
    if (
      this.flags.dataset ||
      this.flags.visibility ||
      this.flags['dataset-default'] ||
      this.isUnattended()
    ) {
      showDefaultConfigPrompt = false
    }

    const detectedFramework = await detectFrameworkRecord({
      frameworkList: frameworks as readonly Framework[],
      rootPath: process.cwd(),
    })
    const isNextJs = detectedFramework?.slug === 'nextjs'

    let remoteTemplateInfo: RepoInfo | undefined
    if (this.flags.template && checkIsRemoteTemplate(this.flags.template)) {
      remoteTemplateInfo = await getGitHubRepoInfo(
        this.flags.template,
        this.flags['template-token'],
      )
    }

    if (detectedFramework && detectedFramework.slug !== 'sanity' && remoteTemplateInfo) {
      this.error(
        `A remote template cannot be used with a detected framework. Detected: ${detectedFramework.name}`,
        {exit: 1},
      )
    }

    const isAppTemplate = this.flags.template ? determineAppTemplate(this.flags.template) : false // Default to false

    // Checks flags are present when in unattended mode
    if (this.isUnattended()) {
      this.checkFlagsInUnattendedMode({createProjectName, isAppTemplate, isNextJs})
    }

    this._trace.start()
    this._trace.log({
      flags: {
        bare: this.flags.bare,
        coupon: this.flags.coupon,
        defaultConfig,
        env: this.flags.env,
        git: this.flags.git,
        plan: this.flags['project-plan'],
        reconfigure: this.flags.reconfigure,
        unattended: this.isUnattended(),
      },
      step: 'start',
    })

    // Plan can be set through `--project-plan`, or implied through `--coupon`.
    // As coupons can expire and project plans might change/be removed, we need to
    // verify that the passed flags are valid. The complexity of this is hidden in the
    // below plan methods, eventually returning a plan ID or undefined if we are told to
    // use the default plan.

    const planId = await this.getPlan()

    let envFilenameDefault = '.env'
    if (detectedFramework && detectedFramework.slug === 'nextjs') {
      envFilenameDefault = '.env.local'
    }
    const envFilename = typeof this.flags.env === 'string' ? this.flags.env : envFilenameDefault

    // If the user isn't already autenticated, make it so
    const {user} = await this.ensureAuthenticated()
    if (!isAppTemplate) {
      this.log(`${logSymbols.success} Fetching existing projects`)
      this.log('')
    }

    let newProject: string | undefined
    if (createProjectName) {
      newProject = await this.createProjectFromName({
        createProjectName,
        planId,
        user,
      })
    }

    const {datasetName, displayName, isFirstProject, organizationId, projectId} =
      await this.getProjectDetails({
        isAppTemplate,
        newProject,
        planId,
        showDefaultConfigPrompt,
        user,
      })

    // If user doesn't want to output any template code
    if (this.flags.bare) {
      this.log(`${logSymbols.success} Below are your project details`)
      this.log('')
      this.log(`Project ID: ${styleText('cyan', projectId)}`)
      this.log(`Dataset: ${styleText('cyan', datasetName)}`)
      this.log(
        `\nYou can find your project on Sanity Manage — https://www.sanity.io/manage/project/${projectId}\n`,
      )
      return
    }

    let initNext = flagOrDefault(this.flags['nextjs-add-config-files'], false)
    if (isNextJs && shouldPrompt(this.isUnattended(), this.flags['nextjs-add-config-files'])) {
      initNext = await promptForConfigFiles()
    }

    this._trace.log({
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
    const outputPath = await this.getProjectOutputPath({
      initFramework,
      sluggedName,
      workDir,
    })

    // Set up MCP integration (skip in non-production environments)
    let mcpMode: 'auto' | 'prompt' | 'skip' = 'prompt'
    if (!this.flags.mcp || !this.resolveIsInteractive() || getSanityEnv() !== 'production') {
      mcpMode = 'skip'
    } else if (this.flags.yes) {
      mcpMode = 'auto'
    }
    const mcpResult = await setupMCP({mode: mcpMode})

    this._trace.log({
      configuredEditors: mcpResult.configuredEditors,
      detectedEditors: mcpResult.detectedEditors,
      skipped: mcpResult.skipped,
      step: 'mcpSetup',
    })
    if (mcpResult.error) {
      this._trace.error(mcpResult.error)
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
        output: this.output,
        outputPath,
      })
    }

    if (initNext) {
      await initNextJs({
        datasetName,
        detectedFramework,
        envFilename,
        mcpConfigured,
        nextjsAppendEnv: this.flags['nextjs-append-env'],
        nextjsEmbedStudio: this.flags['nextjs-embed-studio'],
        output: this.output,
        overwriteFiles: this.flags['overwrite-files'],
        packageManager: this.flags['package-manager'],
        projectId,
        template: this.flags.template,
        trace: this._trace,
        typescript: this.flags.typescript,
        unattended: this.isUnattended(),
        workDir,
      })
      this._trace.complete()
      return
    }

    // user wants to write environment variables to file
    if (this.flags.env) {
      await createOrAppendEnvVars({
        envVars: {
          DATASET: datasetName,
          PROJECT_ID: projectId,
        },
        filename: envFilename,
        framework: detectedFramework,
        log: false,
        output: this.output,
        outputPath,
      })
      await writeStagingEnvIfNeeded(this.output, outputPath)
      this.exit(0)
    }

    const sharedParams = {
      autoUpdates: this.flags['auto-updates'],
      defaults,
      error: this.error.bind(this) as typeof this.error,
      git: this.flags.git,
      noGit: this.flags['no-git'],
      mcpConfigured,
      organizationId,
      output: this.output,
      outputPath,
      overwriteFiles: this.flags['overwrite-files'],
      packageManager: this.flags['package-manager'],
      remoteTemplateInfo,
      sluggedName,
      template: this.flags.template,
      templateToken: this.flags['template-token'],
      trace: this._trace,
      typescript: this.flags.typescript,
      unattended: this.isUnattended(),
      workDir,
    }

    await (isAppTemplate
      ? initApp(sharedParams)
      : initStudio({
          ...sharedParams,
          datasetName,
          displayName,
          importDataset: this.flags['import-dataset'],
          isFirstProject,
          projectId,
        }))

    this._trace.complete()
  }

  private checkFlagsInUnattendedMode({
    createProjectName,
    isAppTemplate,
    isNextJs,
  }: {
    createProjectName: string | undefined
    isAppTemplate: boolean
    isNextJs: boolean
  }) {
    debug('Unattended mode, validating required options')

    // App templates only require --organization and --output-path
    if (isAppTemplate) {
      if (!this.flags['output-path']) {
        this.error('`--output-path` must be specified in unattended mode', {
          exit: 1,
        })
      }

      if (!this.flags.organization) {
        this.error(
          'The --organization flag is required for app templates in unattended mode. ' +
            'Use --organization <id> to specify which organization to use.',
          {exit: 1},
        )
      }

      return
    }

    if (!this.flags['dataset']) {
      this.error(`\`--dataset\` must be specified in unattended mode`, {
        exit: 1,
      })
    }

    // output-path is required in unattended mode when not using nextjs or bare
    if (!isNextJs && !this.flags.bare && !this.flags['output-path']) {
      this.error(`\`--output-path\` must be specified in unattended mode`, {
        exit: 1,
      })
    }

    if (!this.flags.project && !createProjectName) {
      this.error(
        '`--project <id>` or `--project-name <name>` must be specified in unattended mode',
        {exit: 1},
      )
    }

    if (createProjectName && !this.flags.organization) {
      this.error('`--project-name` requires `--organization <id>` in unattended mode', {exit: 1})
    }
  }

  private async createProjectFromName({
    createProjectName,
    planId,
    user,
  }: {
    createProjectName: string
    planId: string | undefined
    user: SanityOrgUser
  }) {
    debug('--project-name specified, creating a new project')

    let orgForCreateProjectFlag = this.flags.organization

    if (!orgForCreateProjectFlag) {
      debug('no organization specified, selecting one')
      const organizations = await listOrganizations()
      orgForCreateProjectFlag = await this.promptUserForOrganization({
        organizations,
        user,
      })
    }

    debug('creating a new project')
    const createdProject = await createProject({
      displayName: createProjectName.trim(),
      metadata: {coupon: this.flags.coupon},
      organizationId: orgForCreateProjectFlag,
      subscription: planId ? {planId} : undefined,
    })

    debug('Project with ID %s created', createdProject.projectId)
    if (this.flags.dataset) {
      debug('--dataset specified, creating dataset (%s)', this.flags.dataset)
      const spin = spinner('Creating dataset').start()
      await createDatasetService({
        aclMode: this.flags.visibility as DatasetAclMode,
        datasetName: this.flags.dataset,
        projectId: createdProject.projectId,
      })
      spin.succeed()
    }

    return createdProject.projectId
  }

  // @todo do we actually need to be authenticated for init? check flags and determine.
  private async ensureAuthenticated(): Promise<{user: SanityOrgUser}> {
    const user = await validateSession()

    if (user) {
      this._trace.log({alreadyLoggedIn: true, step: 'login'})
      this.log(
        `${logSymbols.success} You are logged in as ${user.email} using ${getProviderName(user.provider)}`,
      )
      return {user}
    }

    if (this.isUnattended()) {
      this.error('Must be logged in to run this command in unattended mode, run `sanity login`', {
        exit: 1,
      })
    }

    this._trace.log({step: 'login'})

    try {
      await login({
        output: this.output,
        telemetry: this._trace.newContext('login'),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.error(`Login failed: ${message}`, {exit: 1})
    }

    const loggedInUser = await getCliUser()

    this.log(
      `${logSymbols.success} You are logged in as ${loggedInUser.email} using ${getProviderName(loggedInUser.provider)}`,
    )
    return {user: loggedInUser}
  }

  private async getOrCreateDataset(opts: {
    displayName: string
    projectId: string
    showDefaultConfigPrompt: boolean
  }): Promise<{
    datasetName: string
    userAction: 'create' | 'none' | 'select'
  }> {
    const visibility = this.flags.visibility
    const dataset = this.flags.dataset
    let defaultConfig = this.flags['dataset-default']

    if (dataset && this.isUnattended()) {
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
          output: this.output,
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
        output: this.output,
        projectFeatures,
        projectId: opts.projectId,
        visibility,
      })
      return {datasetName: name, userAction: 'create'}
    }

    debug(`User has ${datasets.length} dataset(s) already, showing list of choices`)
    const datasetChoices = datasets.map((dataset) => ({value: dataset.name}))

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
        output: this.output,
        projectFeatures,
        projectId: opts.projectId,
        visibility,
      })
      return {datasetName: newDatasetName, userAction: 'create'}
    }

    debug(`Returning selected dataset (${selected})`)
    return {datasetName: selected, userAction: 'select'}
  }

  private async getOrCreateProject({
    newProject,
    planId,
    user,
  }: {
    newProject: string | undefined
    planId: string | undefined
    user: SanityOrgUser
  }): Promise<{
    displayName: string
    isFirstProject: boolean
    projectId: string
    userAction: 'create' | 'select'
  }> {
    const projectId = this.flags.project || newProject
    const organizationId = this.flags.organization
    let projects
    let organizations: ProjectOrganization[]

    try {
      const [allProjects, allOrgs] = await Promise.all([listProjects(), listOrganizations()])
      projects = allProjects.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
      organizations = allOrgs
    } catch (err) {
      if (this.isUnattended() && projectId) {
        return {
          displayName: 'Unknown project',
          isFirstProject: false,
          projectId,
          userAction: 'select',
        }
      }
      this.error(`Failed to communicate with the Sanity API:\n${err.message}`, {
        exit: 1,
      })
    }

    if (projects.length === 0 && this.isUnattended()) {
      this.error('No projects found for current user', {exit: 1})
    }

    if (projectId) {
      const project = projects.find((proj) => proj.id === projectId)
      if (!project && !this.isUnattended()) {
        this.error(`Given project ID (${projectId}) not found, or you do not have access to it`, {
          exit: 1,
        })
      }

      return {
        displayName: project ? project.displayName : 'Unknown project',
        isFirstProject: false,
        projectId,
        userAction: 'select',
      }
    }

    if (organizationId) {
      const organization =
        organizations.find((org) => org.id === organizationId) ||
        organizations.find((org) => org.slug === organizationId)

      if (!organization) {
        this.error(
          `Given organization ID (${organizationId}) not found, or you do not have access to it`,
          {exit: 1},
        )
      }

      if (!(await hasProjectAttachGrant(organizationId))) {
        this.error('You lack the necessary permissions to attach a project to this organization', {
          exit: 1,
        })
      }
    }

    // If the user has no projects or is using a coupon (which can only be applied to new projects)
    // just ask for project details instead of showing a list of projects
    const isUsersFirstProject = projects.length === 0
    if (isUsersFirstProject || this.flags.coupon) {
      debug(
        isUsersFirstProject
          ? 'No projects found for user, prompting for name'
          : 'Using a coupon - skipping project selection',
      )

      const newProject = await this.promptForProjectCreation({
        isUsersFirstProject,
        organizationId,
        organizations,
        planId,
        user,
      })

      return {
        ...newProject,
        isFirstProject: isUsersFirstProject,
        userAction: 'create',
      }
    }

    debug(`User has ${projects.length} project(s) already, showing list of choices`)

    const projectChoices = projects.map((project) => ({
      name: `${project.displayName} (${project.id})`,
      value: project.id,
    }))

    const selected = await select({
      choices: [{name: 'Create new project', value: 'new'}, new Separator(), ...projectChoices],
      message: 'Create a new project or select an existing one',
    })

    if (selected === 'new') {
      debug('User wants to create a new project, prompting for name')

      const newProject = await this.promptForProjectCreation({
        isUsersFirstProject,
        organizationId,
        organizations,
        planId,
        user,
      })

      return {
        ...newProject,
        isFirstProject: isUsersFirstProject,
        userAction: 'create',
      }
    }

    debug(`Returning selected project (${selected})`)
    return {
      displayName: projects.find((proj) => proj.id === selected)?.displayName || '',
      isFirstProject: isUsersFirstProject,
      projectId: selected,
      userAction: 'select',
    }
  }

  private async getPlan(): Promise<string | undefined> {
    const intendedPlan = this.flags['project-plan']
    const intendedCoupon = this.flags.coupon

    if (intendedCoupon) {
      return this.verifyCoupon(intendedCoupon)
    } else if (intendedPlan) {
      return this.verifyPlan(intendedPlan)
    } else {
      return undefined
    }
  }

  private async getProjectDetails({
    isAppTemplate,
    newProject,
    planId,
    showDefaultConfigPrompt,
    user,
  }: {
    isAppTemplate: boolean
    newProject: string | undefined
    planId: string | undefined
    showDefaultConfigPrompt: boolean
    user: SanityOrgUser
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
      if (this.flags.organization) {
        return {
          datasetName: '',
          displayName: '',
          isFirstProject: false,
          organizationId: this.flags.organization,
          projectId: '',
        }
      }

      // Interactive mode: fetch orgs and prompt
      // Note: unattended mode without --organization is rejected by checkFlagsInUnattendedMode
      const organizations = await listOrganizations({
        includeImplicitMemberships: 'true',
        includeMembers: 'true',
      })

      const appOrganizationId = await this.promptUserForOrganization({
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
    const project = await this.getOrCreateProject({newProject, planId, user})
    debug(`Project with name ${project.displayName} selected`)

    // Now let's pick or create a dataset
    debug('Prompting user to select or create a dataset')
    const dataset = await this.getOrCreateDataset({
      displayName: project.displayName,
      projectId: project.projectId,
      showDefaultConfigPrompt,
    })
    debug(`Dataset with name ${dataset.datasetName} selected`)

    this._trace.log({
      datasetName: dataset.datasetName,
      selectedOption: dataset.userAction,
      step: 'createOrSelectDataset',
      visibility: this.flags.visibility as 'private' | 'public',
    })

    return {
      datasetName: dataset.datasetName,
      displayName: project.displayName,
      isFirstProject: project.isFirstProject,
      projectId: project.projectId,
    }
  }

  private async getProjectOutputPath({
    initFramework,
    sluggedName,
    workDir,
  }: {
    initFramework: boolean
    sluggedName: string
    workDir: string
  }): Promise<string> {
    const outputPath = this.flags['output-path']
    const specifiedPath = outputPath && path.resolve(outputPath)
    if (this.isUnattended() || specifiedPath || this.flags.env || initFramework) {
      return specifiedPath || workDir
    }

    const inputPath = await input({
      default: path.join(workDir, sluggedName),
      message: 'Project output path:',
      validate: validateEmptyPath,
    })

    return absolutify(inputPath)
  }

  private async promptForProjectCreation({
    isUsersFirstProject,
    organizationId,
    organizations,
    planId,
    user,
  }: {
    isUsersFirstProject: boolean
    organizationId: string | undefined
    organizations: ProjectOrganization[]
    planId: string | undefined
    user: SanityOrgUser
  }) {
    const projectName = await input({
      default: 'My Sanity Project',
      message: 'Project name:',
      validate(input) {
        if (!input || input.trim() === '') {
          return 'Project name cannot be empty'
        }

        if (input.length > 80) {
          return 'Project name cannot be longer than 80 characters'
        }

        return true
      },
    })

    const organization =
      organizationId || (await this.promptUserForOrganization({organizations, user}))

    const newProject = await createProject({
      displayName: projectName,
      metadata: {coupon: this.flags.coupon},
      organizationId: organization,
      subscription: planId ? {planId} : undefined,
    })

    return {
      ...newProject,
      isFirstProject: isUsersFirstProject,
      userAction: 'create',
    }
  }

  private async promptUserForNewOrganization(
    user: SanityOrgUser,
  ): Promise<OrganizationCreateResponse> {
    const name = await promptForOrganizationName(user)

    const spin = spinner('Creating organization').start()
    const organization = await createOrganization(name)
    spin.succeed()

    return organization
  }

  private async promptUserForOrganization({
    isAppTemplate = false,
    organizations,
    user,
  }: {
    isAppTemplate?: boolean
    organizations: ProjectOrganization[]
    user: SanityOrgUser
  }) {
    // If the user has no organizations, prompt them to create one with the same name as
    // their user, but allow them to customize it if they want
    if (organizations.length === 0) {
      const newOrganization = await this.promptUserForNewOrganization(user)
      return newOrganization.id
    }

    let organizationChoices: OrganizationChoices
    let defaultOrganizationId: string | undefined

    if (isAppTemplate) {
      // For app templates, all organizations are valid — no attach grant check needed
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
      const newOrganization = await this.promptUserForNewOrganization(user)
      return newOrganization.id
    }

    return chosenOrg || undefined
  }

  private async verifyCoupon(intendedCoupon: string): Promise<string | undefined> {
    try {
      const planId = await getPlanIdFromCoupon(intendedCoupon)
      this.log(`Coupon "${intendedCoupon}" validated!\n`)
      return planId
    } catch (err: unknown) {
      if (!isHttpError(err) || err.statusCode !== 404) {
        const message = err instanceof Error ? err.message : `${err}`
        this.error(`Unable to validate coupon, please try again later:\n\n${message}`, {exit: 1})
      }

      const useDefaultPlan =
        this.isUnattended() ||
        (await confirm({
          default: true,
          message: `Coupon "${intendedCoupon}" is not available, use default plan instead?`,
        }))

      if (this.isUnattended()) {
        this.warn(`Coupon "${intendedCoupon}" is not available - using default plan`)
      }

      this._trace.log({
        coupon: intendedCoupon,
        selectedOption: useDefaultPlan ? 'yes' : 'no',
        step: 'useDefaultPlanCoupon',
      })

      if (useDefaultPlan) {
        this.log('Using default plan.')
      } else {
        this.error(`Coupon "${intendedCoupon}" does not exist`, {exit: 1})
      }
    }
  }

  private async verifyPlan(intendedPlan: string): Promise<string | undefined> {
    try {
      const planId = await getPlanId(intendedPlan)
      return planId
    } catch (err: unknown) {
      if (!isHttpError(err) || err.statusCode !== 404) {
        const message = err instanceof Error ? err.message : `${err}`
        this.error(`Unable to validate plan, please try again later:\n\n${message}`, {exit: 1})
      }

      const useDefaultPlan =
        this.isUnattended() ||
        (await confirm({
          default: true,
          message: `Project plan "${intendedPlan}" does not exist, use default plan instead?`,
        }))

      if (this.isUnattended()) {
        this.warn(`Project plan "${intendedPlan}" does not exist - using default plan`)
      }

      this._trace.log({
        planId: intendedPlan,
        selectedOption: useDefaultPlan ? 'yes' : 'no',
        step: 'useDefaultPlanId',
      })

      if (useDefaultPlan) {
        this.log('Using default plan.')
      } else {
        this.error(`Plan id "${intendedPlan}" does not exist`, {exit: 1})
      }
    }
  }
}
