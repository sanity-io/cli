import path from 'node:path'

import {Args, Flags} from '@oclif/core'
import {exitCodes, SanityCommand} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {getWorkbench, resolveWorkbenchConfig} from '@sanity/workbench-cli/deploy'

import {deployApp} from '../actions/deploy/deployApp.js'
import {deployDebug} from '../actions/deploy/deployDebug.js'
import {deployStudio} from '../actions/deploy/deployStudio.js'
import {getAppId} from '../util/appId.js'
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
      command: '<%= config.bin %> <%= command.id %> --create --title "My App" --yes --json',
      description:
        'Create and deploy an App SDK app without prompts. Save application.id as deployment.appId, then omit --create on later deploys',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --create --title "My App" --dry-run --json',
      description: 'Preview a new App SDK deployment without creating or uploading anything',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --url my-studio --yes',
      description: 'Deploy a studio without prompts using its hostname',
    },
  ]

  static override flags = {
    'auto-updates': Flags.boolean({
      allowNo: true,
      deprecated: true,
      description: 'Automatically update the studio to the latest version',
    }),
    build: Flags.boolean({
      allowNo: true,
      default: true,
      description:
        'Build the studio before deploying (use --no-build to deploy existing `dist/` output)',
    }),
    create: Flags.boolean({
      description:
        'Create a new App SDK app, even if the organization has other apps. Requires no configured app ID and a title (--title or app.title) when running without prompts',
      exclusive: ['external', 'url'],
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Report what would be deployed without uploading or creating anything',
    }),
    external: Flags.boolean({
      default: false,
      description: 'Register an externally hosted studio',
      exclusive: ['source-maps', 'minify', 'build'],
    }),
    json: Flags.boolean({
      char: 'j',
      default: false,
      description: 'Output the result as JSON',
    }),
    minify: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Minify built JavaScript (use --no-minify to skip for faster builds)',
    }),
    'schema-required': Flags.boolean({
      default: false,
      description: 'Fail if schema deployment fails',
    }),
    'source-maps': Flags.boolean({
      default: false,
      description: 'Enable source maps for built bundles (increases size of bundle)',
    }),
    title: Flags.string({
      description:
        'Title for a newly created application or studio. For apps, use --create to select creation when the organization already has apps',
    }),
    url: Flags.string({
      description:
        'Studio URL for deployment. For external studios, the full URL. For hosted studios, the hostname (e.g. "my-studio" or "my-studio.sanity.studio")',
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

    if (flags.create) {
      if (!isApp) {
        return this.output.error(
          '--create is only supported for App SDK apps. For a studio, use --url <hostname>.',
        )
      }
      if (getAppId(cliConfig)) {
        return this.output.error(
          '--create cannot be used with a configured app ID. Omit --create to deploy to that app, or remove deployment.appId and app.id to create a new one.',
        )
      }
      if (getWorkbench(cliConfig) || resolveWorkbenchConfig(cliConfig)) {
        return this.output.error(
          '--create is not supported for this app configuration. Omit --create and run sanity deploy.',
        )
      }
    }

    const defaultOutputDir = path.resolve(path.join(projectRoot.directory, 'dist'))
    const sourceDir = path.resolve(process.cwd(), this.args.sourceDir || defaultOutputDir)

    // Skip the directory check if the studio is externally hosted
    if (this.args.sourceDir && this.args.sourceDir !== 'dist' && !flags.external) {
      let relativeOutput = path.relative(process.cwd(), sourceDir)
      if (relativeOutput[0] !== '.') {
        relativeOutput = `./${relativeOutput}`
      }

      if (!this.isUnattended() && !flags['dry-run']) {
        const isEmpty = await dirIsEmptyOrNonExistent(sourceDir)
        const shouldProceed =
          isEmpty ||
          (await confirm({
            default: false,
            message: `"${relativeOutput}" is not empty, do you want to proceed?`,
          }))

        if (!shouldProceed) {
          this.output.error('Cancelled.', {exit: exitCodes.RUNTIME_ERROR})
        }
      }

      // Keep --json's stdout clean for the payload
      if (!flags.json) this.output.log(`Building to ${relativeOutput}\n`)
    }

    // Force yes downstream: build/app resolution otherwise prompts for prerelease/version choices
    const deployFlags = this.isUnattended() || flags['dry-run'] ? {...flags, yes: true} : flags

    if (isApp) {
      deployDebug('Deploying app')
      await deployApp({
        cliConfig,
        flags: deployFlags,
        output: this.output,
        projectRoot,
        sourceDir,
      })
    } else {
      deployDebug('Deploying studio')
      await deployStudio({
        cliConfig,
        flags: deployFlags,
        output: this.output,
        projectRoot,
        sourceDir,
      })
    }
  }
}
