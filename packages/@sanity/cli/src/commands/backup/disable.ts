import {select} from '@inquirer/prompts'
import {Args} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {type DatasetsResponse} from '@sanity/client'
import chalk from 'chalk'

import {assertDatasetExists} from '../../actions/backup/assertDatasetExist.js'
import {BACKUP_API_VERSION} from '../../actions/backup/constants.js'
import {listDatasets} from '../../services/datasets.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const disableBackupDebug = subdebug('backup:disable')

export class DisableBackupCommand extends SanityCommand<typeof DisableBackupCommand> {
  static override args = {
    dataset: Args.string({
      description: 'Dataset name to disable backup for',
      required: false,
    }),
  }

  static override description = 'Disable backup for a dataset.'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Interactively disable backup for a dataset',
    },
    {
      command: '<%= config.bin %> <%= command.id %> production',
      description: 'Disable backup for the production dataset',
    },
  ]

  public async run(): Promise<void> {
    const {args} = await this.parse(DisableBackupCommand)
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
      disableBackupDebug(`Failed to list datasets: ${message}`, error)
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

    try {
      await client.request({
        body: {
          enabled: false,
        },
        method: 'PUT',
        uri: `/projects/${projectId}/datasets/${dataset}/settings/backups`,
      })

      this.log(`${chalk.green(`Disabled daily backups for dataset ${dataset}.\n`)}`)
      this.log(
        `${chalk.yellow('Note: Existing backups will be retained according to your retention policy.\n')}`,
      )

      disableBackupDebug(`Successfully disabled backup for dataset ${dataset}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      disableBackupDebug(`Failed to disable backup for dataset`, error)
      this.error(`Disabling dataset backup failed: ${message}`, {exit: 1})
    }
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
      const err = error as Error
      disableBackupDebug(`Error fetching datasets`, err)
      this.error(`Failed to fetch datasets:\n${err.message}`, {exit: 1})
    }
  }
}
