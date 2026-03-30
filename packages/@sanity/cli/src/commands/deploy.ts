import path from 'node:path'

import {Args, Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'

import {deployApp} from '../actions/deploy/deployApp.js'
import {deployDebug} from '../actions/deploy/deployDebug.js'
import {deployStudio} from '../actions/deploy/deployStudio.js'
import {determineIsApp} from '../util/determineIsApp.js'
import {dirIsEmptyOrNonExistent} from '../util/dirIsEmptyOrNonExistent.js'

export class DeployCommand extends SanityCommand<typeof DeployCommand> {
  static override args = {
    sourceDir: Args.directory({
      description: 'Source directory',
    }),
  }

  static override description = 'Builds and deploys Sanity Studio or application to Sanity hosting'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Build and deploy the studio to Sanity hosting',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --no-minify --source-maps',
      description: 'Deploys non-minified build with source maps',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --schema-required',
      description:
        'Fail fast on schema store fails - for when other services rely on the stored schema',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --external',
      description: 'Register an externally hosted studio (studioHost contains full URL)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --url my-studio --yes',
      description: 'Deploy a studio in unattended mode using a specific hostname',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --app-title "My App" --yes',
      description: 'Deploy a new application to Sanity hosting in unattended mode',
    },
  ]

  static override flags = {
    'app-title': Flags.string({
      description: 'Title for a new application deployment, skipping the interactive title prompt',
    }),
    'auto-updates': Flags.boolean({
      allowNo: true,
      deprecated: true,
      description: 'Automatically update the studio to the latest version',
    }),
    build: Flags.boolean({
      allowNo: true,
      default: true,
      description:
        "Don't build the studio prior to deploy, instead deploying the version currently in `dist/`",
    }),
    external: Flags.boolean({
      default: false,
      description: 'Register an externally hosted studio',
      exclusive: ['source-maps', 'minify', 'build'],
    }),
    minify: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Skip minifying built JavaScript (speeds up build, increases size of bundle)',
    }),
    'schema-required': Flags.boolean({
      default: false,
      description: 'Fail-fast deployment if schema store fails',
    }),
    'source-maps': Flags.boolean({
      default: false,
      description: 'Enable source maps for built bundles (increases size of bundle)',
    }),
    url: Flags.string({
      description:
        'Hostname or URL for studio deployment. For hosted studios, provide the subdomain (e.g. "my-studio" or "my-studio.sanity.studio"). For externally hosted studios, provide the full URL (requires --external). Required when using --yes (unattended mode).',
    }),
    verbose: Flags.boolean({
      default: false,
      description: 'Enable verbose logging',
    }),
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description:
        'Unattended mode, answers "yes" to any "yes/no" prompt and otherwise uses defaults',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(DeployCommand)

    const cliConfig = await this.getCliConfig()
    const projectRoot = await this.getProjectRoot()

    const isApp = determineIsApp(cliConfig)

    const defaultOutputDir = path.resolve(path.join(projectRoot.directory, 'dist'))
    const sourceDir = path.resolve(process.cwd(), this.args.sourceDir || defaultOutputDir)

    // Skip the directory check if the studio is externally hosted
    if (this.args.sourceDir && this.args.sourceDir !== 'dist' && !flags.external) {
      let relativeOutput = path.relative(process.cwd(), sourceDir)
      if (relativeOutput[0] !== '.') {
        relativeOutput = `./${relativeOutput}`
      }

      const isEmpty = await dirIsEmptyOrNonExistent(sourceDir)
      // Prompt to delete the directory if it's not empty
      const shouldProceed =
        isEmpty ||
        (await confirm({
          default: false,
          message: `"${relativeOutput}" is not empty, do you want to proceed?`,
        }))

      if (!shouldProceed) {
        this.output.error('Cancelled.', {exit: 1})
      }

      this.output.log(`Building to ${relativeOutput}\n`)
    }

    if (isApp) {
      deployDebug('Deploying app')
      await deployApp({
        cliConfig,
        flags,
        output: this.output,
        projectRoot,
        sourceDir,
      })
    } else {
      deployDebug('Deploying studio')
      await deployStudio({
        cliConfig,
        flags,
        output: this.output,
        projectRoot,
        sourceDir,
      })
    }
  }
}
