import {Args, Command, Flags} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {type FlagInput} from '@oclif/core/interfaces'
import {isInteractive, SanityCommand} from '@sanity/cli-core'

import {initAction} from '../actions/init/initAction.js'
import {InitError} from '../actions/init/initError.js'
import {flagsToInitOptions} from '../actions/init/types.js'

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
  } satisfies FlagInput

  public async run(): Promise<void> {
    // Compute MCP mode from flags and environment:
    // - CI (no TTY) or --no-mcp: skip MCP entirely
    // - --yes (user terminal): auto-configure all detected editors
    // - Interactive: prompt user
    let mcpMode: 'auto' | 'prompt' | 'skip' = 'prompt'
    if (!this.flags.mcp || !isInteractive()) {
      mcpMode = 'skip'
    } else if (this.flags.yes) {
      mcpMode = 'auto'
    }

    try {
      await initAction(flagsToInitOptions(this.flags, this.isUnattended(), this.args, mcpMode), {
        output: this.output,
        telemetry: this.telemetry,
        workDir: process.cwd(),
      })
    } catch (error) {
      if (error instanceof InitError) {
        if (error.exitCode === 0) {
          this.exit(0)
        }
        this.error(error.message, {exit: error.exitCode})
      }
      throw error
    }
  }
}
