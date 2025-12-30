import fs from 'node:fs/promises'
import path from 'node:path'
import {type Writable} from 'node:stream'

import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {input, spinner} from '@sanity/cli-core/ux'
import {type DatasetsResponse} from '@sanity/client'
import {exportDataset, type ExportOptions, type ExportProgress} from '@sanity/export'
import boxen from 'boxen'
import prettyMs from 'pretty-ms'

import {validateDatasetName} from '../../actions/dataset/validateDatasetName.js'
import {promptForDataset} from '../../prompts/promptForDataset.js'
import {absolutify} from '../../util/absolutify.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const noop = () => null
const exportDebug = subdebug('dataset:export')

export class DatasetExportCommand extends SanityCommand<typeof DatasetExportCommand> {
  static override args = {
    name: Args.string({
      description: 'Name of the dataset to export',
    }),
    // Args are order dependent
    // eslint-disable-next-line perfectionist/sort-objects
    destination: Args.string({
      description: 'Output destination file path',
    }),
  }

  static override description =
    'Export dataset to local filesystem as a gzipped tarball. Assets failing with HTTP status codes 401, 403 and 404 upon download are ignored and excluded from export.'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> moviedb localPath.tar.gz',
      description: 'Export dataset "moviedb" to localPath.tar.gz',
    },
    {
      command: '<%= config.bin %> <%= command.id %> moviedb assetless.tar.gz --no-assets',
      description: 'Export dataset without assets',
    },
    {
      command: '<%= config.bin %> <%= command.id %> staging staging.tar.gz --raw',
      description: 'Export raw documents without asset reference rewriting',
    },
    {
      command: '<%= config.bin %> <%= command.id %> staging staging.tar.gz --types products,shops',
      description: 'Export specific document types',
    },
  ]

  static override flags = {
    'asset-concurrency': Flags.integer({
      default: 8,
      description: 'Concurrent number of asset downloads',
    }),
    mode: Flags.string({
      default: 'stream',
      description:
        'Mode to export documents with `cursor` might be more performant for larger datasets, but might not be as accurate if the dataset is being modified during export',
      options: ['stream', 'cursor'],
    }),
    'no-assets': Flags.boolean({
      default: false,
      description: 'Export only non-asset documents and remove references to image assets',
    }),
    'no-compress': Flags.boolean({
      default: false,
      description: 'Skips compressing tarball entries (still generates a gzip file)',
    }),
    'no-drafts': Flags.boolean({
      default: false,
      description: 'Export only published versions of documents',
    }),
    overwrite: Flags.boolean({
      default: false,
      description: 'Overwrite any file with the same name',
    }),
    raw: Flags.boolean({
      default: false,
      description: 'Extract only documents, without rewriting asset references',
    }),
    types: Flags.string({
      description: 'Defines which document types to export (comma-separated)',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(DatasetExportCommand)
    const {destination: targetDestination, name: targetDataset} = args

    // Get project configuration
    const cliConfig = await this.getCliConfig()
    const projectId = await this.getProjectId()

    if (!projectId) {
      this.error(NO_PROJECT_ID, {
        exit: 1,
      })
    }

    // Get the project API client
    const projectClient = await this.getProjectApiClient({
      apiVersion: '2023-05-26',
      projectId,
      requireUser: true,
    })

    let datasets: DatasetsResponse

    try {
      datasets = await projectClient.datasets.list()
    } catch (error) {
      exportDebug('Error listing datasets', error)
      this.error(`Failed to list datasets:\n${error instanceof Error ? error.message : error}`, {
        exit: 1,
      })
    }

    // Determine dataset name
    let dataset = targetDataset
    try {
      if (!dataset) {
        // Get default dataset from config
        const defaultDataset = cliConfig.api?.dataset
        if (defaultDataset) {
          dataset = defaultDataset
          this.log(`Using default dataset: ${dataset}`)
        } else {
          dataset = await promptForDataset({allowCreation: false, datasets})
        }
      }
    } catch (error) {
      exportDebug('Error selecting dataset', error)
      this.error(`Failed to select dataset:\n${error instanceof Error ? error.message : error}`, {
        exit: 1,
      })
    }

    // Validate dataset name
    const dsError = validateDatasetName(dataset)
    if (dsError) {
      this.error(dsError, {exit: 1})
    }

    // Verify existence of dataset before trying to export from it
    if (!datasets.some((set) => set.name === dataset)) {
      this.error(`Dataset with name "${dataset}" not found`, {exit: 1})
    }

    this.log(
      boxen(
        `Exporting from:
projectId: ${projectId.padEnd(44)}
dataset: ${dataset.padEnd(46)}`,
        {
          borderColor: 'yellow',
          borderStyle: 'round',
        },
      ),
    )

    // Determine output path
    let destinationPath = targetDestination
    if (!destinationPath) {
      destinationPath = await this.promptForDestination({dataset})
    }

    const outputPath = await this.getOutputPath(destinationPath, dataset, flags)
    if (!outputPath) {
      this.error('Cancelled', {exit: 1})
    }

    // Prepare export options
    const {fail, onProgress, succeed} = this.createProgressHandler()
    const exportOptions: ExportOptions = {
      assetConcurrency: flags['asset-concurrency'],
      assets: !flags['no-assets'],
      client: projectClient,
      compress: !flags['no-compress'],
      dataset,
      drafts: !flags['no-drafts'],
      mode: flags.mode === 'cursor' || flags.mode === 'stream' ? flags.mode : undefined,
      onProgress,
      outputPath,
      raw: flags.raw,
      types: flags.types ? flags.types.split(',') : undefined,
    }

    const start = Date.now()
    try {
      await exportDataset(exportOptions)
      succeed()
      this.log(`Export finished (${prettyMs(Date.now() - start)})`)
    } catch (error) {
      fail()
      const err = error instanceof Error ? error : new Error(String(error))
      exportDebug('Export failed', err)
      this.error(`Export failed: ${err.message}`, {exit: 1})
    }
  }

  private createProgressHandler() {
    let currentSpinner: ReturnType<typeof spinner> | null = null
    let currentStep = ''

    const onProgress = (progress: ExportProgress) => {
      if (progress.step !== currentStep) {
        // Complete previous step
        succeed()

        // Start new step
        currentStep = progress.step
        currentSpinner = spinner(progress.step).start()
      } else if (progress.step === currentStep && progress.update && currentSpinner) {
        // Update current step with progress info
        currentSpinner.text = `${progress.step} (${progress.current}/${progress.total})`
      }
    }

    const succeed = () => {
      currentSpinner?.succeed()
    }

    const fail = () => {
      currentSpinner?.fail()
    }

    return {fail, onProgress, succeed}
  }

  private async getOutputPath(
    destination: string,
    dataset: string,
    flags: {overwrite?: boolean},
  ): Promise<string | Writable> {
    if (destination === '-') {
      return process.stdout
    }

    const dstPath = path.isAbsolute(destination)
      ? destination
      : path.resolve(process.cwd(), destination)

    const dstStats = await fs.stat(dstPath).catch(noop)
    const looksLikeFile = dstStats ? dstStats.isFile() : path.basename(dstPath).includes('.')

    if (!dstStats) {
      const createPath = looksLikeFile ? path.dirname(dstPath) : dstPath
      try {
        await fs.mkdir(createPath, {recursive: true})
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        const errorWithCode = err as Error & {code?: string}
        if (errorWithCode.code === 'EACCES') {
          this.error(
            `Permission denied: Cannot create directory "${createPath}". Please check write permissions.`,
            {
              exit: 1,
            },
          )
        } else {
          this.error(`Failed to create directory "${createPath}": ${err.message}`, {
            exit: 1,
          })
        }
      }
    }

    const finalPath = looksLikeFile ? dstPath : path.join(dstPath, `${dataset}.tar.gz`)
    const finalPathStats = await fs.stat(finalPath).catch(noop)

    if (!flags.overwrite && finalPathStats && finalPathStats.isFile()) {
      this.error(`File "${finalPath}" already exists. Use --overwrite flag to overwrite it.`, {
        exit: 1,
      })
    }

    return finalPath
  }

  private promptForDestination(options: {dataset: string; workDir?: string}): Promise<string> {
    const {dataset, workDir = process.cwd()} = options

    const defaultPath = path.join(workDir, `${dataset}.tar.gz`)

    return input({
      default: defaultPath,
      message: 'Output path:',
      transformer: (value: string) => absolutify(value.trim()),
      validate: (value: string) => {
        const trimmed = value.trim()
        if (!trimmed) {
          return 'Please provide a valid output path'
        }
        return true
      },
    })
  }
}
