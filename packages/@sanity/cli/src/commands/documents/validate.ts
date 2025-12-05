import fs from 'node:fs'
import path from 'node:path'

import {confirm} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import {logSymbols, Output, SanityCommand} from '@sanity/cli-core'
import {type ClientConfig} from '@sanity/client'
import chalk from 'chalk'

import {DOCUMENTS_API_VERSION} from '../../actions/documents/constants.js'
import {Level} from '../../actions/documents/types.js'
import {validateDocuments} from '../../actions/documents/validate.js'
import {reporters} from '../../actions/documents/validation/reporters/index.js'
import {type ValidationWorkerChannel} from '../../threads/validateDocuments.js'
import {type WorkerChannelReceiver} from '../../util/workerChannels.js'

type ValidateDocumentsCommandFlags = ValidateDocumentsCommand['flags']

export type BuiltInValidationReporter = (options: {
  flags: ValidateDocumentsCommandFlags
  output: Output
  worker: WorkerChannelReceiver<ValidationWorkerChannel>
}) => Promise<Level>

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
  ]

  static flags = {
    dataset: Flags.string({
      char: 'd',
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
      description: 'The minimum level reported out. Defaults to warning',
      options: ['error', 'warning', 'info'],
      parse: async (input) => {
        if (input !== 'error' && input !== 'warning' && input !== 'info') {
          throw new Error(`Invalid level: ${input}. Must be 'error', 'warning', or 'info'`)
        }
        return input as Level
      },
    })(),
    'max-custom-validation-concurrency': Flags.integer({
      default: 5,
      description: 'Specify how many custom validators can run concurrently',
    }),
    'max-fetch-concurrency': Flags.integer({
      default: 25,
      description: 'Specify how many `client.fetch` requests are allow concurrency at once',
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
    const unattendedMode = Boolean(flags.yes)

    const apiClient = await this.getGlobalApiClient({
      apiVersion: DOCUMENTS_API_VERSION,
      requireUser: true,
    })
    const cliConfig = await this.getCliConfig()
    const workDir = (await this.getProjectRoot()).directory

    if (!unattendedMode) {
      this.log(
        `${chalk.yellow(`${logSymbols.warning} Warning:`)} This command ${
          flags.file
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
      if (flags.file) {
        this.log(
          `- Checks for missing document references against the live dataset if not found in your file.`,
        )
      }

      const confirmed = await confirm({
        default: true,
        message: `Are you sure you want to continue?`,
      })

      if (!confirmed) {
        this.log('User aborted')
        this.exit(1)
      }
    }

    if (flags.format && !(flags.format in reporters)) {
      const formatter = new Intl.ListFormat('en-US', {
        style: 'long',
        type: 'conjunction',
      })
      throw new Error(
        `Did not recognize format '${flags.format}'. Available formats are ${formatter.format(
          Object.keys(reporters).map((key) => `'${key}'`),
        )}`,
      )
    }

    const level = flags.level
    const maxCustomValidationConcurrency = flags['max-custom-validation-concurrency']
    const maxFetchConcurrency = flags['max-fetch-concurrency']

    const clientConfig: ClientConfig = {
      ...apiClient.config(),
      // we set this explictly to true because we pass in a token via the
      // `clientConfiguration` object and also mock a browser environment in
      // this worker which triggers the browser warning
      ignoreBrowserTokenWarning: true,
      // Removing from object so config can be serialized
      // before sent to validation worker
      requester: undefined,
      // we set this explictly to true because the default client configuration
      // from the CLI comes configured with `useProjectHostname: false` when
      // `requireProject` is set to false
      useProjectHostname: true,
    }

    let ndjsonFilePath
    if (flags.file) {
      const filePath = path.resolve(workDir, flags.file)

      const stat = await fs.promises.stat(filePath)
      if (!stat.isFile()) {
        this.error(`'--file' must point to a valid ndjson file or tarball`)
      }

      ndjsonFilePath = filePath
    }

    const overallLevel = await validateDocuments({
      clientConfig,
      dataset: flags.dataset,
      level,
      maxCustomValidationConcurrency,
      maxFetchConcurrency,
      ndjsonFilePath,
      reporter: (worker) => {
        const reporter =
          flags.format && flags.format in reporters
            ? reporters[flags.format as keyof typeof reporters]
            : reporters.pretty

        return reporter({flags, output: this.output, worker})
      },
      studioHost: cliConfig?.studioHost,
      workDir,
      workspace: flags.workspace,
    })

    if (overallLevel === 'error') {
      this.exit(1)
    }
  }
}
