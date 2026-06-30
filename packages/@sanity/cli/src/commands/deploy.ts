import path from 'node:path'

import {Args, Flags} from '@oclif/core'
import {exitCodes, SanityCommand} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'

import {deployApp} from '../actions/deploy/deployApp.js'
import {deployDebug} from '../actions/deploy/deployDebug.js'
import {deployStudio} from '../actions/deploy/deployStudio.js'
import {type DryRunReport, renderDryRunReport} from '../actions/deploy/dryRunReport.js'
import {determineIsApp} from '../util/determineIsApp.js'
import {dirIsEmptyOrNonExistent} from '../util/dirIsEmptyOrNonExistent.js'

export class DeployCommand extends SanityCommand<typeof DeployCommand> {
  static override args = {
    sourceDir: Args.directory({
      description: 'Source directory',
    }),
  }

  static override description = 'Builds and deploys Sanity Studio or application to Sanity hosting'

  static override enableJsonFlag = true

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
      command: '<%= config.bin %> <%= command.id %> --dry-run --json',
      description: 'Validate the deployment without deploying, as machine-readable output',
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
      description:
        'Run all deploy checks and list the files that would be uploaded, without deploying. Exits non-zero when not deployable.',
    }),
    external: Flags.boolean({
      default: false,
      description: 'Register an externally hosted studio',
      exclusive: ['source-maps', 'minify', 'build'],
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

  public async run(): Promise<DryRunReport | undefined> {
    const {flags} = await this.parse(DeployCommand)

    const cliConfig = await this.getCliConfig()
    const projectRoot = await this.getProjectRoot()

    const isApp = determineIsApp(cliConfig)

    const defaultOutputDir = path.resolve(path.join(projectRoot.directory, 'dist'))
    const sourceDir = path.resolve(process.cwd(), this.args.sourceDir || defaultOutputDir)

    // Skip the directory check for externally hosted studios, and for dry runs
    // (which never prompt and never overwrite remote state)
    if (
      this.args.sourceDir &&
      this.args.sourceDir !== 'dist' &&
      !flags.external &&
      !flags['dry-run']
    ) {
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

    const deployOptions = {cliConfig, flags, output: this.output, projectRoot, sourceDir}

    deployDebug(isApp ? 'Deploying app' : 'Deploying studio')
    const report = isApp ? await deployApp(deployOptions) : await deployStudio(deployOptions)

    // A report is only returned for dry runs
    if (report) {
      renderDryRunReport(report, this.output)
      if (!report.deployable) {
        // Set the exit code without throwing so --json still emits the full report
        process.exitCode = exitCodes.USAGE_ERROR
      }
    }

    return report
  }
}
