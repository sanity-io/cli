import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {exit} from '@oclif/core/errors'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {Table} from 'console-table-printer'
import {formatDistance, formatDistanceToNow, parseISO} from 'date-fns'

import {validateDatasetName} from '../../actions/dataset/validateDatasetName.js'
import {promptForDataset} from '../../prompts/promptForDataset.js'
import {promptForDatasetName} from '../../prompts/promptForDatasetName.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {
  copyDataset,
  type CopyJobProgressEvent,
  type DatasetCopyJob,
  followCopyJobProgress,
  listDatasetCopyJobs,
  listDatasets,
} from '../../services/datasets.js'
import {projectIdFlag} from '../../util/sharedFlags.js'

const copyDatasetDebug = subdebug('dataset:copy')

export class CopyDatasetCommand extends SanityCommand<typeof CopyDatasetCommand> {
  static override args = {
    source: Args.string({
      description: 'Name of the dataset to copy from',
      required: false,
    }),
    target: Args.string({
      description: 'Name of the dataset to copy to',
      required: false,
    }),
  }

  static override description =
    'Manages dataset copying, including starting a new copy job, listing copy jobs and following the progress of a running copy job'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Interactively copy a dataset',
    },
    {
      command: '<%= config.bin %> <%= command.id %> source-dataset',
      description: 'Copy from source-dataset (prompts for target)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> source-dataset target-dataset',
      description: 'Copy from source-dataset to target-dataset',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --skip-history source target',
      description: 'Copy without preserving document history (faster for large datasets)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --detach source target',
      description: 'Start copy job without waiting for completion',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --attach <job-id>',
      description: 'Attach to a running copy job to follow progress',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --list',
      description: 'List all dataset copy jobs',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --list --offset 2 --limit 10',
      description: 'List copy jobs with pagination',
    },
  ]

  static override flags = {
    ...projectIdFlag,
    attach: Flags.string({
      description: 'Attach to the running copy process to show progress',
      exclusive: ['list', 'detach', 'skip-history'],
      required: false,
    }),
    detach: Flags.boolean({
      description: 'Start the copy without waiting for it to finish',
      exclusive: ['list', 'attach'],
      required: false,
    }),
    limit: Flags.integer({
      dependsOn: ['list'],
      description: 'Maximum number of jobs returned (default 10, max 1000)',
      max: 1000,
      required: false,
    }),
    list: Flags.boolean({
      description: 'Lists all dataset copy jobs',
      exclusive: ['attach', 'detach', 'skip-history'],
      required: false,
    }),
    offset: Flags.integer({
      dependsOn: ['list'],
      description: 'Start position in the list of jobs (default 0)',
      required: false,
    }),
    'skip-history': Flags.boolean({
      description: "Don't preserve document history on copy",
      exclusive: ['list', 'attach'],
      required: false,
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(CopyDatasetCommand)

    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [
            {grant: 'read', permission: 'sanity.project.datasets'},
            {grant: 'create', permission: 'sanity.project.datasets'},
          ],
        }),
    })

    // Route to appropriate mode
    if (flags.list) {
      return this.handleListMode(projectId, flags)
    }

    if (flags.attach) {
      return this.handleAttachMode(projectId, flags.attach)
    }

    return this.handleCopyMode(projectId, args, flags)
  }

  private displayCopyJobsTable(jobs: DatasetCopyJob[]): void {
    const table = new Table({
      columns: [
        {alignment: 'left', name: 'id', title: 'Job ID'},
        {alignment: 'left', name: 'sourceDataset', title: 'Source Dataset'},
        {alignment: 'left', name: 'targetDataset', title: 'Target Dataset'},
        {alignment: 'left', name: 'state', title: 'State'},
        {alignment: 'left', name: 'withHistory', title: 'With history'},
        {alignment: 'left', name: 'timeStarted', title: 'Time started'},
        {alignment: 'left', name: 'timeTaken', title: 'Time taken'},
      ],
      title: 'Dataset copy jobs for this project in descending order',
    })

    for (const job of jobs) {
      const {createdAt, id, sourceDataset, state, targetDataset, updatedAt, withHistory} = job

      let timeStarted = ''
      if (createdAt !== '') {
        timeStarted = formatDistanceToNow(parseISO(createdAt))
      }

      let timeTaken = ''
      if (updatedAt !== '') {
        timeTaken = formatDistance(parseISO(updatedAt), parseISO(createdAt))
      }

      let color: '' | 'green' | 'red' | 'yellow' = ''
      switch (state) {
        case 'completed': {
          color = 'green'
          break
        }
        case 'failed': {
          color = 'red'
          break
        }
        case 'pending': {
          color = 'yellow'
          break
        }
        default: {
          color = ''
        }
      }

      table.addRow(
        {
          id,
          sourceDataset,
          state,
          targetDataset,
          timeStarted: `${timeStarted} ago`,
          timeTaken,
          withHistory,
        },
        {color},
      )
    }

    table.printTable()
  }

  private async handleAttachMode(projectId: string, jobId: string): Promise<void> {
    copyDatasetDebug('Attaching to copy job %s', jobId)

    if (jobId.trim() === '') {
      this.error('Please supply a valid jobId', {exit: 1})
    }

    try {
      await this.subscribeToProgress(projectId, jobId)
      this.log(`Job ${styleText('green', jobId)} completed`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      copyDatasetDebug('Failed to attach to copy job: %s', message, error)
      this.error(`Failed to attach to copy job: ${message}`, {exit: 1})
    }
  }

  private async handleCopyMode(
    projectId: string,
    args: {source?: string; target?: string},
    flags: {detach?: boolean; 'skip-history'?: boolean},
  ): Promise<void> {
    copyDatasetDebug('Starting copy mode')

    const skipHistory = Boolean(flags['skip-history'])

    // Get and validate source dataset
    let sourceDataset = args.source
    if (sourceDataset) {
      const nameError = validateDatasetName(sourceDataset)
      if (nameError) {
        this.error(nameError, {exit: 1})
      }
    }

    let datasetsResponse
    try {
      datasetsResponse = await listDatasets(projectId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      copyDatasetDebug('Failed to fetch datasets: %s', message, error)
      this.error(`Failed to fetch datasets: ${message}`, {exit: 1})
    }

    const datasetNames = new Set(datasetsResponse.map((ds) => ds.name))

    // Prompt for source if not provided
    if (!sourceDataset) {
      sourceDataset = await promptForDataset({
        datasets: datasetsResponse,
      })
    }

    if (!datasetNames.has(sourceDataset)) {
      this.error(`Source dataset "${sourceDataset}" doesn't exist`, {exit: 1})
    }

    // Get and validate target dataset
    let targetDataset = args.target
    if (targetDataset) {
      const nameError = validateDatasetName(targetDataset)
      if (nameError) {
        this.error(nameError, {exit: 1})
      }
    } else {
      targetDataset = await promptForDatasetName({
        message: 'Target dataset name:',
      })
    }

    if (datasetNames.has(targetDataset)) {
      this.error(`Target dataset "${targetDataset}" already exists`, {exit: 1})
    }

    // Start the copy job
    try {
      this.log(
        `Copying dataset ${styleText('green', sourceDataset)} to ${styleText('green', targetDataset)}...`,
      )

      if (!skipHistory) {
        this.log(
          `Note: You can run this command with flag '--skip-history'. The flag will reduce copy time in larger datasets.`,
        )
      }

      const response = await copyDataset({
        projectId,
        skipHistory,
        sourceDataset,
        targetDataset,
      })

      this.log(`Job ${styleText('green', response.jobId)} started`)

      if (flags.detach) {
        return
      }

      await this.subscribeToProgress(projectId, response.jobId)
      this.log(`Job ${styleText('green', response.jobId)} completed`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      copyDatasetDebug('Dataset copying failed: %s', message, error)
      this.error(`Dataset copying failed: ${message}`, {exit: 1})
    }
  }

  private async handleListMode(projectId: string, flags: {limit?: number; offset?: number}): Promise<void> {
    copyDatasetDebug('Listing dataset copy jobs')

    try {
      const jobs = await listDatasetCopyJobs({
        limit: flags.limit,
        offset: flags.offset,
        projectId,
      })

      if (jobs.length === 0) {
        this.log("This project doesn't have any dataset copy jobs")
        return
      }

      this.displayCopyJobsTable(jobs)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      copyDatasetDebug('Failed to list dataset copy jobs: %s', message, error)
      this.error(`Failed to list dataset copy jobs: ${message}`, {exit: 1})
    }
  }

  private async subscribeToProgress(projectId: string, jobId: string): Promise<void> {
    let currentProgress = 0
    const spin = spinner('').start()

    return new Promise<void>((resolve, reject) => {
      const sigintHandler = () => {
        subscription.unsubscribe()
        spin.fail('Copy interrupted.')
        exit(130)
      }

      const subscription = followCopyJobProgress({jobId, projectId}).subscribe({
        complete: () => {
          process.off('SIGINT', sigintHandler)
          spin.succeed('Copy finished.')
          resolve()
        },
        error: (err) => {
          process.off('SIGINT', sigintHandler)
          spin.fail('Copy failed.')
          reject(err)
        },
        next: (event: CopyJobProgressEvent) => {
          if (typeof event.progress === 'number') {
            currentProgress = event.progress
          }
          spin.text = `Copy in progress: ${currentProgress}%`
        },
      })

      process.once('SIGINT', sigintHandler)
    })
  }
}
