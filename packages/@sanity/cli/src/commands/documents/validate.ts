import fs from 'node:fs'
import path from 'node:path'
import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {type CliConfig, ProjectRootNotFoundError, SanityCommand} from '@sanity/cli-core'
import {confirm, logSymbols} from '@sanity/cli-core/ux'

import {type Level} from '../../actions/documents/types.js'
import {validateDocuments} from '../../actions/documents/validate.js'
import {reporters} from '../../actions/documents/validation/reporters/index.js'
import {getDatasetFlag, getProjectIdFlag} from '../../util/sharedFlags.js'

export class ValidateDocumentsCommand extends SanityCommand<typeof ValidateDocumentsCommand> {
  static description = 'Validate documents in a dataset against the studio schema'

  static examples = [
    {
      command: '<%= config.bin %> <%= command.id %> --workspace default',
      description: 'Validates all documents in a Sanity project with more than one workspace',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --workspace default --dataset staging',
      description: 'Override the dataset specified in the workspace',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --yes > report.txt',
      description: 'Save the results of the report into a file',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --level info',
      description: 'Report out info level validation markers too',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --project-id abc123 --dataset production',
      description: 'Validate documents in a specific project and dataset',
    },
  ]

  static flags = {
    ...getProjectIdFlag({
      description:
        'Override the project ID used. By default, this is derived from the given workspace',
    }),
    ...getDatasetFlag({
      description:
        'Override the dataset used. By default, this is derived from the given workspace',
    }),
    file: Flags.string({
      description:
        'Provide a path to either an .ndjson file or a tarball containing an .ndjson file',
    }),
    format: Flags.string({
      description:
        'The output format used to print the found validation markers and report progress',
    }),
    level: Flags.custom<Level>({
      default: 'warning',
      description: 'The minimum level reported. Defaults to warning',
      options: ['error', 'warning', 'info'],
    })(),
    'max-custom-validation-concurrency': Flags.integer({
      default: 5,
      description: 'Specify how many custom validators can run concurrently',
    }),
    'max-fetch-concurrency': Flags.integer({
      default: 25,
      description: 'Specify how many `client.fetch` requests are allowed to run concurrently',
    }),
    workspace: Flags.string({
      description: 'The name of the workspace to use when downloading and validating all documents',
    }),
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description: 'Skips the first confirmation prompt',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(ValidateDocumentsCommand)
    const {
      dataset,
      file,
      format,
      level,
      'max-custom-validation-concurrency': maxCustomValidationConcurrency,
      'max-fetch-concurrency': maxFetchConcurrency,
      'project-id': projectId,
      workspace,
    } = flags
    const unattendedMode = Boolean(flags.yes)

    let workDir: string
    let cliConfig: CliConfig
    try {
      const root = await this.getProjectRoot()
      workDir = root.directory
      cliConfig = await this.getCliConfig()
    } catch (err) {
      if (err instanceof ProjectRootNotFoundError) {
        this.error(
          'This command must be run from within a Sanity project directory (requires studio schema for validation)',
          {exit: 1},
        )
      }
      throw err
    }

    if (!unattendedMode) {
      this.log(
        `${styleText('yellow', `${logSymbols.warning} Warning:`)} This command ${
          file
            ? 'reads all documents from your input file'
            : 'downloads all documents from your dataset'
        } and processes them through your local schema within a ` +
          `simulated browser environment.\n`,
      )
      this.log(`Potential pitfalls:\n`)
      this.log(
        `- Processes all documents locally (excluding assets). Large datasets may require more resources.`,
      )
      this.log(
        `- Executes all custom validation functions. Some functions may need to be refactored for compatibility.`,
      )
      this.log(
        `- Not all standard browser features are available and may cause issues while loading your Studio.`,
      )
      this.log(
        `- Adheres to document permissions. Ensure this account can see all desired documents.`,
      )
      if (file) {
        this.log(
          `- Checks for missing document references against the live dataset if not found in your file.`,
        )
      }

      const confirmed = await confirm({
        default: true,
        message: `Are you sure you want to continue?`,
      })

      if (!confirmed) {
        this.error('User aborted', {exit: 1})
      }
    }

    if (format && !(format in reporters)) {
      const formatter = new Intl.ListFormat('en-US', {
        style: 'long',
        type: 'conjunction',
      })
      this.error(
        `Did not recognize format '${format}'. Available formats are ${formatter.format(
          Object.keys(reporters).map((key) => `'${key}'`),
        )}`,
        {exit: 1},
      )
    }

    let ndjsonFilePath
    if (file) {
      const filePath = path.resolve(workDir, file)

      const stat = await fs.promises.stat(filePath)
      if (!stat.isFile()) {
        this.error(`'--file' must point to a valid ndjson file or tarball`, {exit: 1})
      }

      ndjsonFilePath = filePath
    }

    try {
      const overallLevel = await validateDocuments({
        dataset,
        level,
        maxCustomValidationConcurrency,
        maxFetchConcurrency,
        ndjsonFilePath,
        projectId,
        reporter: (worker) => {
          const reporter =
            format && format in reporters
              ? reporters[format as keyof typeof reporters]
              : reporters.pretty

          return reporter({flags, output: this.output, worker})
        },
        studioHost: cliConfig.studioHost,
        workDir,
        workspace,
      })

      if (overallLevel === 'error') {
        this.exit(1)
      }
    } catch (err) {
      this.error(err instanceof Error ? err.message : String(err), {exit: 1})
    }
  }
}
