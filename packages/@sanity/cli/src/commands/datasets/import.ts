import fs from 'node:fs'
import path from 'node:path'

import {Args, Flags} from '@oclif/core'
import {getProjectCliClient, isInteractive, SanityCommand, subdebug} from '@sanity/cli-core'
import {createRequester} from '@sanity/cli-core/request'
import {spinner} from '@sanity/cli-core/ux'
import {sanityImport} from '@sanity/import'
import prettyMs from 'pretty-ms'

import {NEW_DATASET_VALUE, promptForDataset} from '../../prompts/promptForDataset.js'
import {promptForDatasetName} from '../../prompts/promptForDatasetName.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {createDataset, listDatasets} from '../../services/datasets.js'
import {getDatasetFlag, getProjectIdFlag} from '../../util/sharedFlags.js'

const importDebug = subdebug('dataset:import')

interface ProgressEvent {
  step: string

  current?: number
  total?: number
  update?: string
}

function getAssetsBase(source: string): string | undefined {
  if (/^https?:\/\//i.test(source) || source === '-') {
    return undefined
  }

  try {
    const fileStats = fs.statSync(source)
    const sourceIsFolder = fileStats.isDirectory()
    return sourceIsFolder ? source : path.dirname(source)
  } catch {
    return undefined
  }
}

async function getUriStream(uri: string): Promise<NodeJS.ReadableStream> {
  const request = createRequester({
    middleware: {promise: {onlyBody: false}},
  })

  try {
    const response = (await request({stream: true, url: uri})) as {body: NodeJS.ReadableStream}
    return response.body
  } catch (err) {
    throw new Error(`Error fetching source:\n${(err as Error).message}`)
  }
}

function getPercentage(opts: ProgressEvent): string {
  if (!opts.total) {
    return ''
  }

  const percent = Math.floor(((opts.current || 0) / opts.total) * 100)
  return `[${percent}%] `
}

export class ImportDatasetCommand extends SanityCommand<typeof ImportDatasetCommand> {
  static override args = {
    source: Args.string({
      description: 'Source file (use "-" for stdin)',
      required: true,
    }),
    targetDataset: Args.string({
      description: 'Target dataset (prefer --dataset flag instead)',
      required: false,
    }),
  }

  static override description = 'Import documents to a Sanity dataset'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> -d staging my-dataset.ndjson',
      description: 'Import "./my-dataset.ndjson" into dataset "staging"',
    },
    {
      command: 'cat my-dataset.ndjson | <%= config.bin %> <%= command.id %> -d test -',
      description: 'Import into dataset "test" from stdin',
    },
    {
      command: '<%= config.bin %> <%= command.id %> -p projectId -d staging my-dataset.ndjson',
      description: 'Import with explicit project ID (overrides CLI configuration)',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> -d staging -t someSecretToken my-dataset.ndjson',
      description: 'Import with an explicit token (e.g. for CI/CD)',
    },
  ]

  static override flags = {
    'allow-assets-in-different-dataset': Flags.boolean({
      default: false,
      description: 'Allow asset documents to reference different project/dataset',
    }),
    'allow-failing-assets': Flags.boolean({
      default: false,
      description: 'Skip assets that cannot be fetched/uploaded',
    }),
    'allow-replacement-characters': Flags.boolean({
      default: false,
      description: 'Allow unicode replacement characters in imported documents',
    }),
    'allow-system-documents': Flags.boolean({
      default: false,
      description: 'Imports system documents',
    }),
    'asset-concurrency': Flags.integer({
      description: 'Number of parallel asset imports',
    }),
    ...getDatasetFlag({
      description: 'Dataset to import to',
      semantics: 'specify',
    }),
    missing: Flags.boolean({
      default: false,
      description: 'Skip documents that already exist',
      exclusive: ['replace'],
    }),
    ...getProjectIdFlag({
      description: 'Project ID to import to',
      semantics: 'override',
    }),
    project: Flags.string({
      deprecated: {to: 'project-id'},
      description: 'Project ID to import to',
      hidden: true,
    }),
    replace: Flags.boolean({
      default: false,
      description: 'Replace documents with the same IDs',
      exclusive: ['missing'],
    }),
    'replace-assets': Flags.boolean({
      default: false,
      description: 'Skip reuse of existing assets',
    }),
    'skip-cross-dataset-references': Flags.boolean({
      default: false,
      description: 'Skips references to other datasets',
    }),
    token: Flags.string({
      char: 't',
      description: 'Token to authenticate with',
      env: 'SANITY_IMPORT_TOKEN',
      required: false,
    }),
  }

  static override hiddenAliases: string[] = ['dataset:import']

  private currentProgress?: ReturnType<typeof spinner>
  private currentStep?: string
  private spinInterval?: NodeJS.Timeout | null
  private stepStart?: number

  private static async getStream(source: string): Promise<NodeJS.ReadableStream> {
    if (/^https?:\/\//i.test(source)) {
      return getUriStream(source)
    }

    return source === '-' ? process.stdin : fs.createReadStream(source)
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(ImportDatasetCommand)

    const {
      'allow-assets-in-different-dataset': allowAssetsInDifferentDataset,
      'allow-failing-assets': allowFailingAssets,
      'allow-replacement-characters': allowReplacementCharacters,
      'allow-system-documents': allowSystemDocuments,
      'asset-concurrency': assetConcurrency,
      dataset: datasetFlag,
      missing,
      replace,
      'replace-assets': replaceAssets,
      'skip-cross-dataset-references': skipCrossDatasetReferences,
      token,
    } = flags

    const projectId = await this.getProjectId({
      deprecatedFlagName: 'project',
      fallback: () => promptForProject({}),
    })

    const {source, targetDataset: targetDatasetArg} = args

    if (targetDatasetArg && !datasetFlag) {
      this.warn(
        'Positional dataset argument is deprecated. Use the --dataset flag instead: --dataset <name>',
      )
    }

    let dataset = datasetFlag ?? targetDatasetArg
    if (!dataset) {
      if (!isInteractive()) {
        this.error(
          'Missing dataset. Use the --dataset flag to specify a dataset: --dataset <name>',
          {exit: 1},
        )
      }

      const datasets = await listDatasets(projectId)
      dataset = await promptForDataset({allowCreation: true, datasets})

      if (dataset === NEW_DATASET_VALUE) {
        const newDatasetName = await promptForDatasetName()

        try {
          await createDataset({datasetName: newDatasetName, projectId})
          dataset = newDatasetName
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          importDebug(`Failed to create dataset ${newDatasetName}: ${message}`, error)
          this.error(`Failed to create dataset ${newDatasetName}: ${message}`, {exit: 1})
        }
      }
    }

    let operation: 'create' | 'createIfNotExists' | 'createOrReplace' = 'create'
    let releasesOperation: 'fail' | 'ignore' | 'replace' = 'fail'

    if (replace || missing) {
      operation = replace ? 'createOrReplace' : 'createIfNotExists'
      releasesOperation = replace ? 'replace' : 'ignore'
    }

    const client = await getProjectCliClient({
      apiVersion: 'v2025-02-19',
      dataset,
      projectId,
      requireUser: true,
      ...(token ? {token} : {}),
    })

    try {
      const stream = await ImportDatasetCommand.getStream(source)
      const assetsBase = getAssetsBase(source)

      const importOptions = {
        allowAssetsInDifferentDataset,
        allowFailingAssets,
        allowReplacementCharacters,
        allowSystemDocuments,
        client,
        onProgress: this.onProgress.bind(this),
        operation,
        releasesOperation,
        replaceAssets,
        skipCrossDatasetReferences,
        tag: 'sanity.import',
        targetDataset: dataset,
        targetProjectId: projectId,
        ...(assetsBase ? {assetsBase} : {}),
        ...(assetConcurrency === undefined ? {} : {assetConcurrency}),
      }

      const {numDocs, warnings} = await sanityImport(stream as NodeJS.ReadableStream, importOptions)

      if (this.stepStart) {
        const timeSpent = prettyMs(Date.now() - this.stepStart, {secondsDecimalDigits: 2})
        if (this.currentProgress) {
          if (this.spinInterval) {
            clearInterval(this.spinInterval)
            this.spinInterval = null
          }
          this.currentProgress.text = `[100%] ${this.currentStep} (${timeSpent})`
          this.currentProgress.succeed()
        }
      }

      this.log('Done! Imported %d documents to dataset "%s"\n', numDocs, dataset)
      this.printWarnings(warnings)
    } catch (err) {
      if (this.spinInterval) {
        clearInterval(this.spinInterval)
        this.spinInterval = null
      }

      if (this.currentProgress) {
        this.currentProgress.fail()
      }

      if ((err as Error).name === 'ReplacementCharError') {
        this.error(
          `Import failed due to unicode replacement characters in the data.\n${(err as Error).message}\n\nIf you are certain you want to proceed with the import despite potentially corrupt data, re-run the import with the \`--allow-replacement-characters\` flag set.`,
          {exit: 1},
        )
      } else {
        this.error((err as Error).stack || (err as Error).message, {exit: 1})
      }
    }
  }

  private onProgress(opts: ProgressEvent): void {
    const lengthComputable = opts.total
    const sameStep = opts.step === this.currentStep
    const percent = getPercentage(opts)

    if (lengthComputable && opts.total === opts.current && this.spinInterval) {
      clearInterval(this.spinInterval)
      this.spinInterval = null
    }

    if (sameStep && !lengthComputable) {
      return
    }

    if (sameStep) {
      if (this.stepStart) {
        const timeSpent = prettyMs(Date.now() - this.stepStart, {secondsDecimalDigits: 2})
        if (this.currentProgress) {
          this.currentProgress.text = `${percent}${opts.step} (${timeSpent})`
          this.currentProgress.render()
        }
      }
      return
    }

    // Moved to a new step
    const prevStep = this.currentStep
    const prevStepStart = this.stepStart
    this.stepStart = Date.now()
    this.currentStep = opts.step

    if (this.spinInterval) {
      clearInterval(this.spinInterval)
      this.spinInterval = null
    }

    if (this.currentProgress && this.currentProgress.succeed && prevStepStart) {
      const timeSpent = prettyMs(Date.now() - prevStepStart, {
        secondsDecimalDigits: 2,
      })
      this.currentProgress.text = `[100%] ${prevStep} (${timeSpent})`
      this.currentProgress.succeed()
    }

    this.currentProgress = spinner(`[0%] ${opts.step} (0.00s)`).start()

    if (!lengthComputable) {
      this.spinInterval = setInterval(() => {
        if (this.stepStart && this.currentProgress) {
          const timeSpent = prettyMs(Date.now() - this.stepStart, {
            secondsDecimalDigits: 2,
          })
          this.currentProgress.text = `${percent}${opts.step} (${timeSpent})`
          this.currentProgress.render()
        }
      }, 60)
    }
  }

  private printWarnings(warnings: Array<{message: string; type?: string; url?: string}>): void {
    const assetFails = warnings.filter((warn) => warn.type === 'asset')

    if (assetFails.length === 0) {
      return
    }

    this.warn(`Failed to import the following ${assetFails.length > 1 ? 'assets' : 'asset'}:`)

    for (const warning of assetFails) {
      if (warning.url) {
        this.warn(`  ${warning.url}`)
      }
    }
  }
}
