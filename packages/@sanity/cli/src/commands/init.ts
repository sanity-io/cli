import {confirm} from '@inquirer/prompts'
import {Args, Command, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {getCliToken, SanityCommand, subdebug} from '@sanity/cli-core'
import {
  type CurrentSanityUser,
  isHttpError,
  type SanityClient,
  type SanityUser,
} from '@sanity/client'

import {getProviderName} from '../actions/auth/getProviderName.js'

const debug = subdebug('init')

const INIT_API_VERSION = 'v2025-06-01'

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
    'package-manager': Flags.string({
      description: 'Specify which package manager to use [allowed: npm, yarn, pnpm]',
      exclusive: ['bare'],
      helpValue: '<manager>',
      options: ['npm', 'yarn', 'pnpm'],
    }),
    project: Flags.string({
      description: 'Project ID to use for the studio',
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

    // Slightly more helpful message for removed flags rather than just saying the flag
    // does not exist.
    if (this.flags.reconfigure) {
      this.error('--reconfigure is deprecated - manual configuration is now required', {exit: 1})
      return
    }

    // Plan can be set through `--project-plan`, or implied through `--coupon`.
    // As coupons can expire and project plans might change/be removed, we need to
    // verify that the passed flags are valid. The complexity of this is hidden in the
    // below plan methods, eventually returning a plan ID or undefined if we are told to
    // use the default plan.
    const plan = await this.getPlan()

    // If the user isn't already autenticated, make it so
    this.ensureAuthenticated()

    // @todo
    //const trace = telemetry.trace(CLIInitStepCompleted)
  }

  // @todo do we actually need to be authenticated for init? check flags and determine.
  private async ensureAuthenticated(): Promise<{user: CurrentSanityUser}> {
    const isAuthenticated = getCliToken() !== undefined
    debug(isAuthenticated ? 'User already has a token' : 'User has no token')

    let user: SanityUser | undefined
    if (isAuthenticated) {
      // @todo
      //trace.log({step: 'login', alreadyLoggedIn: true})
      const client = await this.getGlobalApiClient({apiVersion: INIT_API_VERSION})
      const user = await client.users.getById('me')
      this.log('You are logged in as %s using %s', user.email, getProviderName(user.provider))
      return {user}
    }

    if (this.isUnattended()) {
      throw new Error(
        'Must be logged in to run this command in unattended mode, run `sanity login`',
      )
    }

    // @todo telemetry
    //trace.log({step: 'login'})

    // @todo trigger login action, then get and return user info
    await this.config.runCommand('login')

    // const user = await getOrCreateUser()
    // return {user}
  }

  private async getPlan(): Promise<string | undefined> {
    const intendedPlan = this.flags['project-plan']
    const intendedCoupon = this.flags.coupon

    if (intendedCoupon) {
      return this.getPlanFromCoupon(intendedCoupon)
    } else if (intendedPlan) {
      return this.verifyPlan(intendedPlan)
    } else {
      return undefined
    }
  }

  private async getPlanFromCoupon(intendedCoupon: string): Promise<string | undefined> {
    const client = await this.getGlobalApiClient({
      apiVersion: INIT_API_VERSION,
      requireUser: false,
    })

    try {
      const planId = await this.getPlanIdFromCoupon(client, intendedCoupon)
      this.log(`Coupon "${intendedCoupon}" validated!\n`)
      return planId
    } catch (err: unknown) {
      if (!isHttpError(err) || err.statusCode !== 404) {
        throw new Error(`Unable to validate coupon, please try again later:\n\n${err.message}`)
      }

      const useDefaultPlan =
        this.isUnattended() ??
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

  private async getPlanIdFromCoupon(client: SanityClient, couponCode: string): Promise<string> {
    const response = await client.request<{id: string}[]>({
      uri: `plans/coupon/${encodeURIComponent(couponCode)}`,
    })

    if (!Array.isArray(response) || response.length === 0) {
      throw new Error(`No plans found for coupon code "${couponCode}"`)
    }

    const planId = response[0].id
    if (!planId) {
      throw new Error('Unable to find a plan from coupon code')
    }

    return planId
  }

  private async verifyPlan(intendedPlan: string): Promise<string | undefined> {
    const client = await this.getGlobalApiClient({
      apiVersion: INIT_API_VERSION,
      requireUser: false,
    })

    try {
      const response = await client.request<{id: string}[]>({uri: `plans/${intendedPlan}`})
      if (Array.isArray(response) && response.length > 0) {
        return response[0].id
      }

      const useDefaultPlan =
        this.isUnattended() ??
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : `${err}`
      throw new Error(`Unable to validate plan, please try again later:\n\n${message}`, {
        cause: err,
      })
    }
  }
}
