import path from 'node:path'

import {Args, Flags} from '@oclif/core'
import {isWorkbenchApp, SanityCommand} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'

import {coreAppAdapter} from '../actions/deploy/coreApp.js'
import {deployDebug} from '../actions/deploy/deployDebug.js'
import {runDeploy} from '../actions/deploy/runDeploy.js'
import {studioAdapter} from '../actions/deploy/studio.js'
import {workbenchAppAdapter, workbenchStudioAdapter} from '../actions/deploy/workbench.js'
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
        'Title for a newly created application or studio. For apps it also skips the interactive title prompt, enabling unattended creation',
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
          this.output.error('Cancelled.', {exit: 1})
        }
      }

      // Keep --json's stdout clean for the payload
      if (!flags.json) this.output.log(`Building to ${relativeOutput}\n`)
    }

    // Force yes downstream: build/app resolution otherwise prompts for prerelease/version choices
    const deployFlags = this.isUnattended() || flags['dry-run'] ? {...flags, yes: true} : flags

    // A workbench app follows the same deploy procedure but ships elsewhere,
    // so it swaps in its own adapter.
    const workbench = isWorkbenchApp(cliConfig?.app)
    const adapter = isApp
      ? workbench
        ? workbenchAppAdapter
        : coreAppAdapter
      : workbench
        ? workbenchStudioAdapter
        : studioAdapter

    deployDebug(`Deploying with the ${workbench ? 'workbench ' : ''}${adapter.type} adapter`)
    await runDeploy(
      {cliConfig, flags: deployFlags, output: this.output, projectRoot, sourceDir},
      adapter,
    )
  }
}
