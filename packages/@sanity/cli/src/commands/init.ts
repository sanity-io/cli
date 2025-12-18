// @Todo will remove by time migration of this command is complete
/* eslint-disable @typescript-eslint/no-unused-vars */
import {confirm, input, select} from '@inquirer/prompts'
import {Args, Command, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {
  getCliToken,
  logSymbols,
  SanityCommand,
  type SanityOrgUser,
  spinner,
  subdebug,
} from '@sanity/cli-core'
import {type DatasetAclMode, isHttpError} from '@sanity/client'
import {type Framework, frameworks} from '@vercel/frameworks'
import {detectFrameworkRecord, LocalFileSystemDetector} from '@vercel/fs-detectors'

import {getProviderName} from '../actions/auth/getProviderName.js'
import {login} from '../actions/auth/login/index.js'
import {INIT_API_VERSION} from '../actions/init/constants.js'
import {determineAppTemplate} from '../actions/init/determineAppTemplate.js'
import {
  checkIsRemoteTemplate,
  getGitHubRepoInfo,
  type RepoInfo,
} from '../actions/init/remoteTemplate.js'
import {getOrganizationChoices} from '../actions/organizations/getOrganizationChoices.js'
import {getOrganizationsWithAttachGrantInfo} from '../actions/organizations/getOrganizationsWithAttachGrantInfo.js'
import {createDataset} from '../services/datasets.js'
import {
  createOrganization,
  listOrganizations,
  type OrganizationCreateResponse,
  type ProjectOrganization,
} from '../services/organizations.js'
import {getPlanId, getPlanIdFromCoupon} from '../services/plans.js'
import {createProject} from '../services/projects.js'

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
          throw new Error('Env filename (`--env`) must start with `.env`')
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
      default: true,
      description: 'Add config files to Next.js project',
      helpGroup: 'Next.js',
    }),
    'nextjs-append-env': Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Append project ID and dataset to .env file',
      helpGroup: 'Next.js',
    }),
    'nextjs-embed-studio': Flags.boolean({
      allowNo: true,
      default: true,
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
      default: false,
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
    reconfigure: Flags.boolean({
      deprecated: {message: 'This flag is no longer supported', version: '3.0.0'},
      description: 'Reconfigure an existing project',
      hidden: true,
    }),
    template: Flags.string({
      default: 'clean',
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
      default: true,
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
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(InitCommand)
    const createProjectName = this.flags['create-project']
    // For backwards "compatibility" - we used to allow `sanity init plugin`,
    // and no longer do - but instead of printing an error about an unknown
    // _command_, we want to acknowledge that the user is trying to do something
    // that no longer exists but might have at some point in the past.
    if (args.type) {
      this.error(
        args.type === 'plugin'
          ? 'Initializing plugins through the CLI is no longer supported'
          : `Unknown init type "${args.type}"`,
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
      throw new Error(
        'You have specified both a project and an organization. To move a project to an organization please visit https://www.sanity.io/manage',
      )
    }

    const defaultConfig = this.flags['dataset-default']
    let _showDefaultConfigPrompt = !defaultConfig
    if (
      this.flags.dataset ||
      this.flags.visibility ||
      this.flags['dataset-default'] ||
      this.isUnattended()
    ) {
      _showDefaultConfigPrompt = false
    }

    const detectedFramework: Framework | null = await detectFrameworkRecord({
      frameworkList: frameworks as readonly Framework[],
      fs: new LocalFileSystemDetector(process.cwd()),
    })
    const isNextJs = detectedFramework?.slug === 'nextjs'

    let remoteTemplateInfo: RepoInfo | undefined
    if (flags.template && checkIsRemoteTemplate(flags.template)) {
      remoteTemplateInfo = await getGitHubRepoInfo(flags.template, flags['template-token'])
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
    const _envFilename = typeof flags.env === 'string' ? flags.env : envFilenameDefault

    // If the user isn't already autenticated, make it so
    const {user} = await this.ensureAuthenticated()

    // skip project / dataset prompting
    const template = this.flags.template
    const isAppTemplate = template ? determineAppTemplate(template) : false // Default to false
    if (!isAppTemplate) {
      this.log(`${logSymbols.success} Fetching existing projects`)
      this.log('')
    }

    const _newProjectId =
      createProjectName && (await this.createProject({createProjectName, planId, user}))
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
      throw new Error(`\`--dataset\` must be specified in unattended mode`)
    }

    // output-path is not used in unattended mode within nextjs
    if (!isNextJs && !this.flags['output-path']) {
      throw new Error(`\`--output-path\` must be specified in unattended mode`)
    }

    if (!this.flags.project && !createProjectName) {
      throw new Error(
        '`--project <id>` or `--create-project <name>` must be specified in unattended mode',
      )
    }

    if (createProjectName && !this.flags.organization) {
      throw new Error(
        '--create-project is not supported in unattended mode without an organization, please specify an organization with `--organization <id>`',
      )
    }
  }

  private async createProject({
    createProjectName,
    planId,
    user,
  }: {
    createProjectName: string
    planId: string | undefined
    user: SanityOrgUser
  }): Promise<string> {
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
      await createDataset({
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
      const client = await this.getGlobalApiClient({
        apiVersion: INIT_API_VERSION,
        requireUser: true,
      })

      try {
        user = (await client.users.getById('me')) as unknown as SanityOrgUser
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
        throw new Error(
          'Must be logged in to run this command in unattended mode, run `sanity login`',
        )
      }

      // @todo telemetry
      //trace.log({step: 'login'})

      // @todo trigger login action, then get and return user info
      await login({output: this.output})
    }

    // @todo
    const client = await this.getGlobalApiClient({apiVersion: INIT_API_VERSION, requireUser: true})
    user = (await client.users.getById('me')) as unknown as SanityOrgUser

    this.log(
      `${logSymbols.success} You are logged in as ${user.email} using ${getProviderName(user.provider)}`,
    )
    return {user}
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

  private async promptUserForNewOrganization(
    user: SanityOrgUser,
  ): Promise<OrganizationCreateResponse> {
    const name = await input({
      default: user ? user.name : undefined,
      message: 'Organization name:',
      validate(input) {
        if (input.length === 0) {
          return 'Organization name cannot be empty'
        } else if (input.length > 100) {
          return 'Organization name cannot be longer than 100 characters'
        }
        return true
      },
    })

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
      return this.promptUserForNewOrganization(user).then((org) => org.id)
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
      return this.promptUserForNewOrganization(user).then((org) => org.id)
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
        throw new Error(`Unable to validate coupon, please try again later:\n\n${message}`)
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
        throw new Error(`Coupon "${intendedCoupon}" does not exist`)
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
        throw new Error(`Unable to validate plan, please try again later:\n\n${message}`, {
          cause: err,
        })
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
        throw new Error(`Plan id "${intendedPlan}" does not exist`)
      }
    }
  }
}
