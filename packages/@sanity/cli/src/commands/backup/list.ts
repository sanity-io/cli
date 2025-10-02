import {select} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {type DatasetsResponse} from '@sanity/client'
import {Table} from 'console-table-printer'
import {isAfter, isValid, lightFormat, parse} from 'date-fns'

import {assertDatasetExists} from '../../actions/backup/assertDatasetExist.js'
import {BACKUP_API_VERSION} from '../../actions/backup/constants.js'
import {listDatasets} from '../../services/datasets.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const listBackupDebug = subdebug('backup:list')

const DEFAULT_LIST_BACKUP_LIMIT = 30

type ListBackupRequestQueryParams = {
  after?: string
  before?: string
  limit: string
}

type ListBackupResponse = {
  backups: ListBackupResponseItem[]
}

type ListBackupResponseItem = {
  createdAt: string
  id: string
}

export class ListBackupCommand extends SanityCommand<typeof ListBackupCommand> {
  static override args = {
    dataset: Args.string({
      description: 'Dataset name to list backups for',
      required: false,
    }),
  }

  static override description = 'List available backups for a dataset.'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List backups for a dataset interactively',
    },
    {
      command: '<%= config.bin %> <%= command.id %> production',
      description: 'List backups for the production dataset',
    },
    {
      command: '<%= config.bin %> <%= command.id %> production --limit 50',
      description: 'List up to 50 backups for the production dataset',
    },
    {
      command: '<%= config.bin %> <%= command.id %> production --after 2024-01-31 --limit 10',
      description: 'List up to 10 backups created after 2024-01-31',
    },
  ]

  static override flags = {
    after: Flags.string({
      description: 'Only return backups after this date (inclusive, YYYY-MM-DD format)',
    }),
    before: Flags.string({
      description: 'Only return backups before this date (exclusive, YYYY-MM-DD format)',
    }),
    limit: Flags.integer({
      char: 'l',
      default: DEFAULT_LIST_BACKUP_LIMIT,
      description: 'Maximum number of backups returned',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(ListBackupCommand)
    let {dataset} = args

    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    const client = await this.getGlobalApiClient({
      apiVersion: BACKUP_API_VERSION,
      requireUser: true,
    })

    let datasets: DatasetsResponse

    try {
      datasets = await listDatasets(projectId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      listBackupDebug(`Failed to list datasets: ${message}`, error)
      this.error(`Failed to list datasets: ${message}`, {exit: 1})
    }

    if (datasets.length === 0) {
      this.error('No datasets found in this project.', {exit: 1})
    }

    if (dataset) {
      assertDatasetExists(datasets, dataset)
    } else {
      dataset = await this.promptForDataset(datasets)
    }

    // Validate date flags
    if (flags.before || flags.after) {
      try {
        const parsedBefore = this.processDateFlag(flags.before, 'before')
        const parsedAfter = this.processDateFlag(flags.after, 'after')

        if (parsedAfter && parsedBefore && isAfter(parsedAfter, parsedBefore)) {
          this.error('--after date must be before --before', {exit: 1})
        }
      } catch (err) {
        this.error(`Parsing date flags: ${err instanceof Error ? err.message : err}`, {exit: 1})
      }
    }

    // Validate limit flag
    if (flags.limit < 1 || flags.limit > Number.MAX_SAFE_INTEGER) {
      this.error(`Parsing --limit: must be an integer between 1 and ${Number.MAX_SAFE_INTEGER}`, {
        exit: 1,
      })
    }

    const query: ListBackupRequestQueryParams = {
      limit: flags.limit.toString(),
    }

    if (flags.after) {
      query.after = flags.after
    }

    if (flags.before) {
      query.before = flags.before
    }

    try {
      const response = await client.request<ListBackupResponse>({
        query,
        uri: `/projects/${projectId}/datasets/${dataset}/backups`,
      })

      if (response.backups.length === 0) {
        this.log('No backups found.')
        return
      }

      const table = new Table({
        columns: [
          {alignment: 'left', name: 'resource', title: 'RESOURCE'},
          {alignment: 'left', name: 'createdAt', title: 'CREATED AT'},
          {alignment: 'left', name: 'backupId', title: 'BACKUP ID'},
        ],
      })

      for (const backup of response.backups) {
        const {createdAt, id} = backup
        table.addRow({
          backupId: id,
          createdAt: lightFormat(Date.parse(createdAt), 'yyyy-MM-dd HH:mm:ss'),
          resource: 'Dataset',
        })
      }

      table.printTable()

      listBackupDebug(
        `Successfully listed ${response.backups.length} backups for dataset ${dataset}`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      listBackupDebug(`Failed to list backups for dataset ${dataset}:`, error)
      this.error(`List dataset backup failed: ${message}`, {exit: 1})
    }
  }

  private processDateFlag(date: string | undefined, flagName: string): Date | undefined {
    if (!date) return undefined
    const parsedDate = parse(date, 'yyyy-MM-dd', new Date())
    if (isValid(parsedDate)) {
      return parsedDate
    }

    throw new Error(`Invalid date format for '--${flagName}' flag. Use YYYY-MM-DD`)
  }

  private async promptForDataset(datasets: DatasetsResponse): Promise<string> {
    try {
      const choices = datasets.map((dataset) => ({
        name: dataset.name,
        value: dataset.name,
      }))

      return select({
        choices,
        message: 'Select the dataset name:',
      })
    } catch (error) {
      listBackupDebug(`Error selecting dataset`, error)
      this.error(`Failed to select dataset:\n${error instanceof Error ? error.message : error}`, {
        exit: 1,
      })
    }
  }
}
