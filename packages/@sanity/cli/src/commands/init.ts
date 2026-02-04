// @Todo will remove by time migration of this command is complete
import {existsSync} from 'node:fs'
import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {styleText} from 'node:util'

import {Args, Command, Flags} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {getCliToken, SanityCommand, type SanityOrgUser, subdebug} from '@sanity/cli-core'
import {confirm, input, logSymbols, select, Separator, spinner} from '@sanity/cli-core/ux'
import {type DatasetAclMode, isHttpError} from '@sanity/client'
import {DatasetImportCommand} from '@sanity/import'
import {type Framework, frameworks} from '@vercel/frameworks'
import {detectFrameworkRecord, LocalFileSystemDetector} from '@vercel/fs-detectors'
import {execa, type Options} from 'execa'
import {deburr} from 'lodash-es'

import {getProviderName} from '../actions/auth/getProviderName.js'
import {login} from '../actions/auth/login/login.js'
import {createDataset} from '../actions/dataset/create.js'
import {bootstrapTemplate} from '../actions/init/bootstrapTemplate.js'
import {checkNextJsReactCompatibility} from '../actions/init/checkNextJsReactCompatibility.js'
import {countNestedFolders} from '../actions/init/countNestedFolders.js'
import {determineAppTemplate} from '../actions/init/determineAppTemplate.js'
import {createOrAppendEnvVars} from '../actions/init/env/createOrAppendEnvVars.js'
import {fetchPostInitPrompt} from '../actions/init/fetchPostInitPrompt.js'
import {tryGitInit} from '../actions/init/git.js'
import {
  checkIsRemoteTemplate,
  getGitHubRepoInfo,
  type RepoInfo,
} from '../actions/init/remoteTemplate.js'
import {resolvePackageManager} from '../actions/init/resolvePackageManager.js'
import templates from '../actions/init/templates/index.js'
import {
  sanityCliTemplate,
  sanityConfigTemplate,
  sanityFolder,
  sanityStudioTemplate,
} from '../actions/init/templates/nextjs/index.js'
import {type VersionedFramework} from '../actions/init/types.js'
import {EditorName} from '../actions/mcp/editorConfigs.js'
import {setupMCP} from '../actions/mcp/setupMCP.js'
import {getOrganizationChoices} from '../actions/organizations/getOrganizationChoices.js'
import {getOrganizationsWithAttachGrantInfo} from '../actions/organizations/getOrganizationsWithAttachGrantInfo.js'
import {hasProjectAttachGrant} from '../actions/organizations/hasProjectAttachGrant.js'
import {
  promptForAppendEnv,
  promptForConfigFiles,
  promptForEmbeddedStudio,
  promptForNextTemplate,
  promptForStudioPath,
} from '../prompts/init/nextjs.js'
import {promptForTypeScript} from '../prompts/init/promptForTypescript.js'
import {promptForDatasetName} from '../prompts/promptForDatasetName.js'
import {promptForDefaultConfig} from '../prompts/promptForDefaultConfig.js'
import {promptForOrganizationName} from '../prompts/promptForOrganizationName.js'
import {createCorsOrigin, listCorsOrigins} from '../services/cors.js'
import {createDataset as createDatasetService, listDatasets} from '../services/datasets.js'
import {getProjectFeatures} from '../services/getProjectFeatures.js'
import {
  createOrganization,
  listOrganizations,
  type OrganizationCreateResponse,
  type ProjectOrganization,
} from '../services/organizations.js'
import {getPlanId, getPlanIdFromCoupon} from '../services/plans.js'
import {createProject, listProjects, updateProjectInitializedAt} from '../services/projects.js'
import {getCliUser} from '../services/user.js'
import {absolutify, validateEmptyPath} from '../util/fsUtils.js'
import {getProjectDefaults} from '../util/getProjectDefaults.js'
import {
  installDeclaredPackages,
  installNewPackages,
} from '../util/packageManager/installPackages.js'
import {
  getPartialEnvWithNpmPath,
  type PackageManager,
} from '../util/packageManager/packageManagerChoice.js'

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
        '<%= config.bin %> <%= command.id %> -y --create-project "Movies Unlimited" --dataset moviedb --visibility private --template moviedb --output-path /Users/espenh/movies-unlimited',
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
      description: 'Create a new project with the given name',
      helpValue: '<name>',
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
      exclusive: ['create-project'],
      helpValue: '<id>',
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
      deprecated: {message: 'This flag is no longer supported', version: '3.0.0'},
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

  public async run(): Promise<void> {
    const workDir = process.cwd()

    const createProjectName = this.flags['create-project']
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

    // @todo
    //const trace = telemetry.trace(CLIInitStepCompleted)

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
      fs: new LocalFileSystemDetector(process.cwd()),
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

    // Checks flags are present when in unattended mode
    if (this.isUnattended()) {
      this.checkFlagsInUnattendedMode({createProjectName, isNextJs})
    }

    // @todo
    // trace.start()
    // trace.log({
    //   step: 'start',
    //   flags: {
    //     defaultConfig,
    //     unattended,
    //     plan: intendedPlan,
    //     coupon: intendedCoupon,
    //     reconfigure,
    //     git: commitMessage,
    //     bare: bareOutput,
    //     env,
    //   },
    // })

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

    const isAppTemplate = this.flags.template ? determineAppTemplate(this.flags.template) : false // Default to false
    if (!isAppTemplate) {
      this.log(`${logSymbols.success} Fetching existing projects`)
      this.log('')
    }

    let newProject: string | undefined
    if (createProjectName) {
      newProject = await this.createProjectFromName({createProjectName, planId, user})
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

    let initNext = this.flagOrDefault('nextjs-add-config-files', false)
    if (isNextJs && this.promptForUndefinedFlag(this.flags['nextjs-add-config-files'])) {
      initNext = await promptForConfigFiles()
    }

    // @todo
    // trace.log({
    //   step: 'useDetectedFramework',
    //   selectedOption: initNext ? 'yes' : 'no',
    //   detectedFramework: detectedFramework?.name,
    // })

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

    // Set up MCP integration
    const mcpResult = await setupMCP(this.flags.mcp)
    // @todo
    // trace.log({
    //   step: 'mcpSetup',
    //   detectedEditors: mcpResult.detectedEditors,
    //   configuredEditors: mcpResult.configuredEditors,
    //   skipped: mcpResult.skipped,
    // })
    // if (mcpResult.error) {
    //   trace.error(mcpResult.error)
    // }
    const mcpConfigured = mcpResult.configuredEditors

    if (isNextJs) {
      await checkNextJsReactCompatibility({
        detectedFramework,
        output: this.output,
        outputPath,
      })
    }

    if (initNext) {
      await this.initNextJs({
        datasetName,
        detectedFramework,
        envFilename,
        mcpConfigured,
        projectId,
        workDir,
      })
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
      this.exit(0)
    }

    // Prompt for template to use
    const templateName = await this.promptForTemplate()
    // @todo
    // trace.log({step: 'selectProjectTemplate', selectedOption: templateName})
    const template = templates[templateName]
    if (!remoteTemplateInfo && !template) {
      this.error(`Template "${templateName}" not found`, {exit: 1})
    }

    let useTypeScript = this.flags.typescript
    if (!remoteTemplateInfo && template && template.typescriptOnly === true) {
      useTypeScript = true
    } else if (this.promptForUndefinedFlag(this.flags.typescript)) {
      useTypeScript = await promptForTypeScript()
      // @todo
      // trace.log({step: 'useTypeScript', selectedOption: useTypeScript ? 'yes' : 'no'})
    }

    // If the template has a sample dataset, prompt the user whether or not we should import it
    const shouldImport =
      !this.isUnattended() &&
      template?.datasetUrl &&
      (await this.promptForDatasetImport(template.importPrompt))

    // @todo
    // trace.log({step: 'importTemplateDataset', selectedOption: shouldImport ? 'yes' : 'no'})

    try {
      await updateProjectInitializedAt(projectId)
    } catch (err) {
      // Non-critical update
      debug('Failed to update cliInitializedAt metadata', err)
    }

    try {
      await bootstrapTemplate({
        autoUpdates: this.flags['auto-updates'],
        bearerToken: this.flags['template-token'],
        dataset: datasetName,
        organizationId,
        output: this.output,
        outputPath,
        overwriteFiles: this.flags['overwrite-files'],
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
      interactive: !this.isUnattended(),
      output: this.output,
      packageManager: this.flags['package-manager'] as PackageManager,
      targetDir: outputPath,
    })

    // @todo
    // trace.log({selectedOption: pkgManager, step: 'selectPackageManager', })

    // Now for the slow part... installing dependencies
    await installDeclaredPackages(outputPath, pkgManager, {output: this.output, workDir})

    const useGit = this.flags.git === undefined || Boolean(this.flags.git)
    const commitMessage = this.flags.git
    // Try initializing a git repository
    if (useGit) {
      tryGitInit(outputPath, typeof commitMessage === 'string' ? commitMessage : undefined)
    }

    // Prompt for dataset import (if a dataset is defined)
    if (shouldImport && template?.datasetUrl) {
      const token = await getCliToken()
      if (!token) {
        this.error('Authentication required to import dataset', {exit: 1})
      }
      await DatasetImportCommand.run(
        [template.datasetUrl, '--project', projectId, '--dataset', datasetName, '--token', token],
        {
          root: outputPath,
        },
      )

      this.log('')
      this.log('If you want to delete the imported data, use')
      this.log(`  ${styleText('cyan', `npx sanity dataset delete ${datasetName}`)}`)
      this.log('and create a new clean dataset with')
      this.log(`  ${styleText('cyan', `npx sanity dataset create <name>`)}\n`)
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
      this.log(
        `${logSymbols.success} ${styleText(['green', 'bold'], 'Success!')} Your custom app has been scaffolded.`,
      )
      if (!isCurrentDir) this.log(goToProjectDir)
      this.log(
        `\n${styleText('bold', 'Next')}, configure the project(s) and dataset(s) your app should work with.`,
      )
      this.log('\nGet started in `src/App.tsx`, or refer to our documentation for a walkthrough:')
      this.log(
        styleText(['blue', 'underline'], 'https://www.sanity.io/docs/app-sdk/sdk-configuration'),
      )
      if (mcpConfigured && mcpConfigured.length > 0) {
        const message = await this.getPostInitMCPPrompt(mcpConfigured)
        this.log(`\n${message}`)
        this.log(`\nLearn more: ${styleText('cyan', 'https://mcp.sanity.io')}`)
        this.log(
          `\nHave feedback? Tell us in the community: ${styleText('cyan', 'https://www.sanity.io/community/join')}`,
        )
      }
      this.log('\n')
      this.log(`Other helpful commands:`)
      this.log(`npx sanity docs browse     to open the documentation in a browser`)
      this.log(`npx sanity dev             to start the development server for your app`)
      this.log(`npx sanity deploy          to deploy your app`)
    } else {
      //output for Studios here
      this.log(`✅ ${styleText(['green', 'bold'], 'Success!')} Your Studio has been created.`)
      if (!isCurrentDir) this.log(goToProjectDir)
      this.log(
        `\nGet started by running ${styleText('cyan', devCommand)} to launch your Studio's development server`,
      )
      if (mcpConfigured && mcpConfigured.length > 0) {
        const message = await this.getPostInitMCPPrompt(mcpConfigured)
        this.log(`\n${message}`)
        this.log(`\nLearn more: ${styleText('cyan', 'https://mcp.sanity.io')}`)
        this.log(
          `\nHave feedback? Tell us in the community: ${styleText('cyan', 'https://www.sanity.io/community/join')}`,
        )
      }
      this.log('\n')
      this.log(`Other helpful commands:`)
      this.log(`npx sanity docs browse     to open the documentation in a browser`)
      this.log(`npx sanity manage          to open the project settings in a browser`)
      this.log(`npx sanity help            to explore the CLI manual`)
    }

    if (isFirstProject) {
      // @todo
      // trace.log({step: 'sendCommunityInvite', selectedOption: 'yes'})

      const DISCORD_INVITE_LINK = 'https://www.sanity.io/community/join'

      this.log(`\nJoin the Sanity community: ${styleText('cyan', DISCORD_INVITE_LINK)}`)
      this.log('We look forward to seeing you there!\n')
    }

    // @todo
    // trace.complete()
  }

  private checkFlagsInUnattendedMode({
    createProjectName,
    isNextJs,
  }: {
    createProjectName: string | undefined
    isNextJs: boolean
  }) {
    debug('Unattended mode, validating required options')

    if (!this.flags['dataset']) {
      this.error(`\`--dataset\` must be specified in unattended mode`, {exit: 1})
    }

    // output-path is required in unattended mode when not using nextjs
    if (!isNextJs && !this.flags['output-path']) {
      this.error(`\`--output-path\` must be specified in unattended mode`, {exit: 1})
    }

    if (!this.flags.project && !createProjectName) {
      this.error(
        '`--project <id>` or `--create-project <name>` must be specified in unattended mode',
        {exit: 1},
      )
    }

    if (createProjectName && !this.flags.organization) {
      this.error(
        '--create-project is not supported in unattended mode without an organization, please specify an organization with `--organization <id>`',
        {exit: 1},
      )
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
    debug('--create-project specified, creating a new project')

    let orgForCreateProjectFlag = this.flags.organization

    if (!orgForCreateProjectFlag) {
      debug('no organization specified, selecting one')
      const organizations = await listOrganizations()
      orgForCreateProjectFlag = await this.promptUserForOrganization({organizations, user})
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
    let isAuthenticated = (await getCliToken()) !== undefined
    debug(isAuthenticated ? 'User already has a token' : 'User has no token')

    let user: SanityOrgUser | undefined
    if (isAuthenticated) {
      // It _appears_ we are authenticated, but the token might be invalid/expired,
      // so we need to verify that we can actually make an authenticated request.
      try {
        user = await getCliUser()
      } catch {
        // assume that any error means that the token is invalid
        isAuthenticated = false
      }
    }

    if (isAuthenticated) {
      // @todo telemetry
      // trace.log({ step: 'login', alreadyLoggedIn: true })
    } else {
      if (this.isUnattended()) {
        this.error('Must be logged in to run this command in unattended mode, run `sanity login`', {
          exit: 1,
        })
      }

      // @todo telemetry
      //trace.log({step: 'login'})

      // @todo trigger login action, then get and return user info
      await login({output: this.output})
    }

    user = await getCliUser()

    this.log(
      `${logSymbols.success} You are logged in as ${user.email} using ${getProviderName(user.provider)}`,
    )
    return {user}
  }

  private flagOrDefault(flag: keyof typeof this.flags, defaultValue: boolean): boolean {
    return typeof this.flags[flag] === 'boolean' ? this.flags[flag] : defaultValue
  }

  private async getOrCreateDataset(opts: {
    displayName: string
    projectId: string
    showDefaultConfigPrompt: boolean
  }): Promise<{datasetName: string; userAction: 'create' | 'none' | 'select'}> {
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

    const datasetInfo =
      'Your content will be stored in a dataset that can be public or private, depending on\nwhether you want to query your content with or without authentication.\nThe default dataset configuration has a public dataset named "production".'

    if (datasets.length === 0) {
      debug('No datasets found for project, prompting for name')
      if (opts.showDefaultConfigPrompt) {
        this.log(datasetInfo)
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
        this.log(datasetInfo)
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
      this.error(`Failed to communicate with the Sanity API:\n${err.message}`, {exit: 1})
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

  private async getPostInitMCPPrompt(editorsNames: EditorName[]): Promise<string> {
    return fetchPostInitPrompt(new Intl.ListFormat('en').format(editorsNames))
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
      const organizations = await listOrganizations({
        includeImplicitMemberships: 'true',
        includeMembers: 'true',
      })

      const appOrganizationId = await this.promptUserForOrganization({organizations, user})

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

    // @todo
    // trace.log({
    //   step: 'createOrSelectDataset',
    //   selectedOption: dataset.userAction,
    //   datasetName: dataset.datasetName,
    //   visibility: flags.visibility as 'private' | 'public',
    // })

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

  private async initNextJs({
    datasetName,
    detectedFramework,
    envFilename,
    mcpConfigured,
    projectId,
    workDir,
  }: {
    datasetName: string
    detectedFramework: VersionedFramework | null
    envFilename: string
    mcpConfigured: EditorName[]
    projectId: string
    workDir: string
  }) {
    let useTypeScript = this.flagOrDefault('typescript', true)
    if (this.promptForUndefinedFlag(this.flags.typescript)) {
      useTypeScript = await promptForTypeScript()
    }
    // @todo
    // trace.log({step: 'useTypeScript', selectedOption: useTypeScript ? 'yes' : 'no'})

    const fileExtension = useTypeScript ? 'ts' : 'js'
    let embeddedStudio = this.flagOrDefault('nextjs-embed-studio', true)
    if (this.promptForUndefinedFlag(this.flags['nextjs-embed-studio'])) {
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

      const studioPath = this.isUnattended() ? '/studio' : await promptForStudioPath()

      const embeddedStudioRouteFilePath = path.join(
        srcPath,
        `${studioPath}/`,
        `[[...tool]]/page.${fileExtension}x`,
      )

      // this selects the correct template string based on whether the user is using the app or pages directory and
      // replaces the ":configPath:" placeholder in the template with the correct path to the sanity.config.ts file.
      // we account for the user-defined embeddedStudioPath (default /studio) is accounted for by creating enough "../"
      // relative paths to reach the root level of the project
      await this.writeOrOverwrite(
        embeddedStudioRouteFilePath,
        sanityStudioTemplate.replace(
          ':configPath:',
          `${'../'.repeat(countNestedFolders(embeddedStudioRouteFilePath.slice(workDir.length)))}sanity.config`,
        ),
        workDir,
      )

      const sanityConfigPath = path.join(workDir, `sanity.config.${fileExtension}`)
      await this.writeOrOverwrite(
        sanityConfigPath,
        sanityConfigTemplate(hasSrcFolder)
          .replace(':route:', embeddedStudioRouteFilePath.slice(workDir.length).replace('src/', ''))
          .replace(':basePath:', studioPath),
        workDir,
      )
    }

    const sanityCliPath = path.join(workDir, `sanity.cli.${fileExtension}`)
    await this.writeOrOverwrite(sanityCliPath, sanityCliTemplate, workDir)

    let templateToUse = this.flags.template ?? 'clean'
    if (this.promptForUndefinedFlag(this.flags.template)) {
      templateToUse = await promptForNextTemplate()
    }

    await this.writeSourceFiles({
      fileExtension,
      files: sanityFolder(useTypeScript, templateToUse as 'blog' | 'clean'),
      folderPath: undefined,
      srcFolderPrefix: hasSrcFolder,
      workDir,
    })

    let appendEnv = this.flagOrDefault('nextjs-append-env', true)
    if (this.promptForUndefinedFlag(this.flags['nextjs-append-env'])) {
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
        output: this.output,
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

          this.log(
            createCorsRes.id
              ? `Added ${nextjsLocalDevOrigin} to CORS origins`
              : `Failed to add ${nextjsLocalDevOrigin} to CORS origins`,
          )
        } catch (error) {
          debug(`Error creating new CORS Origin ${nextjsLocalDevOrigin}: ${error}`)
          this.error(`Failed to add ${nextjsLocalDevOrigin} to CORS origins: ${error}`, {exit: 1})
        }
      }
    }

    const chosen = await resolvePackageManager({
      interactive: !this.isUnattended(),
      output: this.output,
      packageManager: this.flags['package-manager'] as PackageManager,
      targetDir: workDir,
    })
    // @todo
    // trace.log({step: 'selectPackageManager', selectedOption: chosen})
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
        output: this.output,
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
        await execa('npx', ['install-peerdeps', '--yarn', 'next-sanity@11'], execOptions)
        break
      }
      default: {
        // bun and manual - do nothing or handle differently
        break
      }
    }

    this.log(
      `\n${styleText('green', 'Success!')} Your Sanity configuration files has been added to this project`,
    )
    if (mcpConfigured && mcpConfigured.length > 0) {
      const message = await this.getPostInitMCPPrompt(mcpConfigured)
      this.log(`\n${message}`)
      this.log(`\nLearn more: ${styleText('cyan', 'https://mcp.sanity.io')}`)
      this.log(
        `\nHave feedback? Tell us in the community: ${styleText('cyan', 'https://www.sanity.io/community/join')}`,
      )
    }

    this.exit(0)
  }

  private async promptForDatasetImport(message?: string) {
    return confirm({
      default: true,
      message: message || 'This template includes a sample dataset, would you like to use it?',
    })
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

  private async promptForTemplate() {
    const template = this.flags.template

    const defaultTemplate = this.isUnattended() || template ? template || 'clean' : null
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

  private promptForUndefinedFlag(flag: unknown) {
    return !this.isUnattended() && flag === undefined
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
    organizations,
    user,
  }: {
    organizations: ProjectOrganization[]
    user: SanityOrgUser
  }) {
    // If the user has no organizations, prompt them to create one with the same name as
    // their user, but allow them to customize it if they want
    if (organizations.length === 0) {
      const newOrganization = await this.promptUserForNewOrganization(user)
      return newOrganization.id
    }

    // If the user has organizations, let them choose from them, but also allow them to
    // create a new one in case they do not have access to any of them, or they want to
    // create a personal/other organization.
    debug(`User has ${organizations.length} organization(s), checking attach access`)
    const withGrantInfo = await getOrganizationsWithAttachGrantInfo(organizations)
    const withAttach = withGrantInfo.filter(({hasAttachGrant}) => hasAttachGrant)

    debug('User has attach access to %d organizations.', withAttach.length)
    const organizationChoices = getOrganizationChoices(withAttach)

    // If the user only has a single organization (and they have attach access to it),
    // we'll default to that one. Otherwise, we'll default to the organization with the
    // same name as the user if it exists.
    const defaultOrganizationId =
      withAttach.length === 1
        ? withAttach[0].organization.id
        : organizations.find((org) => org.name === user?.name)?.id

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

      // @todo
      // trace.log({
      //   step: 'useDefaultPlanCoupon',
      //   selectedOption: useDefaultPlan ? 'yes' : 'no',
      //   coupon: intendedCoupon,
      // })

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

      // @todo
      // trace.log({
      //   step: 'useDefaultPlanId',
      //   selectedOption: useDefaultPlan ? 'yes' : 'no',
      //   planId: intendedPlan,
      // })

      if (useDefaultPlan) {
        this.log('Using default plan.')
      } else {
        this.error(`Plan id "${intendedPlan}" does not exist`, {exit: 1})
      }
    }
  }

  private async writeOrOverwrite(filePath: string, content: string, workDir: string) {
    if (existsSync(filePath)) {
      let overwrite = this.flagOrDefault('overwrite-files', false)
      if (this.promptForUndefinedFlag(this.flags['overwrite-files'])) {
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
  private async writeSourceFiles({
    fileExtension,
    files,
    folderPath,
    srcFolderPrefix,
    workDir,
  }: {
    fileExtension: string
    files: Record<string, Record<string, string> | string>
    folderPath?: string
    srcFolderPrefix?: boolean
    workDir: string
  }) {
    for (const [filePath, content] of Object.entries(files)) {
      // check if file ends with full stop to indicate it's file and not directory (this only works with our template tree structure)
      if (filePath.includes('.') && typeof content === 'string') {
        await this.writeOrOverwrite(
          path.join(
            workDir,
            srcFolderPrefix ? 'src' : '',
            'sanity',
            folderPath || '',
            `${filePath}${fileExtension}`,
          ),
          content,
          workDir,
        )
      } else {
        await mkdir(path.join(workDir, srcFolderPrefix ? 'src' : '', 'sanity', filePath), {
          recursive: true,
        })
        if (typeof content === 'object') {
          await this.writeSourceFiles({
            fileExtension,
            files: content,
            folderPath: filePath,
            srcFolderPrefix,
            workDir,
          })
        }
      }
    }
  }
}
