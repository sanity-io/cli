import {input, select} from '@inquirer/prompts'
import {Args} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {type DatasetsResponse} from '@sanity/client'
import chalk from 'chalk'

import {BACKUP_API_VERSION} from '../../actions/backup/constants.js'
import {listDatasets} from '../../actions/backup/listDatasets.js'
import {parseApiErr} from '../../actions/backup/parseApiErr.js'
import {validateDatasetName} from '../../actions/dataset/validateDatasetName.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const enableBackupDebug = subdebug('backup:enable')

export class EnableBackupCommand extends SanityCommand<typeof EnableBackupCommand> {
  static override args = {
    dataset: Args.string({
      description: 'Dataset name to enable backup for',
      required: false,
    }),
  }

  static override description = 'Enable backup for a dataset.'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Interactively enable backup for a dataset',
    },
    {
      command: '<%= config.bin %> <%= command.id %> production',
      description: 'Enable backup for the production dataset',
    },
  ]

  public async run(): Promise<void> {
    const {args} = await this.parse(EnableBackupCommand)
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
      datasets = await listDatasets({projectId})
    } catch (error) {
      const {message} = parseApiErr(error)
      enableBackupDebug(`Failed to list datasets: ${message}`, error)
      this.error(`Failed to list datasets: ${message}`, {exit: 1})
    }

    const hasProduction = datasets.some((dataset) => dataset.name === 'production')

    if (datasets.length === 0) {
      this.error('No datasets found in this project.', {exit: 1})
    }

    if (dataset) {
      if (!datasets.some((d) => d.name === dataset)) {
        this.error(`Dataset '${dataset}' not found...`, {exit: 1})
      }
    } else {
      dataset = await this.promptForDataset(datasets)

      if (dataset === 'new') {
        const newDatasetName = await this.promptForDatasetName(hasProduction)

        try {
          const projectClient = await this.getProjectApiClient({
            apiVersion: BACKUP_API_VERSION,
            projectId,
            requireUser: true,
          })
          await projectClient.datasets.create(newDatasetName)
          dataset = newDatasetName
        } catch (error) {
          const {message} = parseApiErr(error)
          enableBackupDebug(`Failed to create dataset ${newDatasetName}: ${message}`, error)
          this.error(`Failed to create dataset ${newDatasetName}: ${message}`, {exit: 1})
        }
      }
    }

    try {
      await client.request({
        body: {
          enabled: true,
        },
        method: 'PUT',
        uri: `/projects/${projectId}/datasets/${dataset}/settings/backups`,
      })

      this.log(
        `${chalk.green(
          `Enabled backups for dataset ${dataset}.\nPlease note that it may take up to 24 hours before the first backup is created.\n`,
        )}`,
      )

      this.log(
        `${chalk.bold(`Retention policies may apply depending on your plan and agreement.\n`)}`,
      )

      enableBackupDebug(`Successfully enabled backup for dataset ${dataset}`)
    } catch (error) {
      const {message} = parseApiErr(error)
      enableBackupDebug(`Failed to enable backup for dataset`, error)
      this.error(`Enabling dataset backup failed: ${message}`, {exit: 1})
    }
  }

  private async promptForDataset(datasets: DatasetsResponse): Promise<string> {
    try {
      const choices = datasets.map((dataset) => ({
        name: dataset.name,
        value: dataset.name,
      }))

      return select({
        choices: [{name: 'Create new dataset', value: 'new'}, ...choices],
        message: 'Select the dataset name:',
      })
    } catch (error) {
      const err = error as Error
      enableBackupDebug(`Error fetching datasets`, err)
      this.error(`Failed to fetch datasets:\n${err.message}`, {exit: 1})
    }
  }

  private async promptForDatasetName(hasProduction?: boolean): Promise<string> {
    return input({
      default: hasProduction ? 'production' : undefined,
      message: 'Dataset name:',
      validate: (name) => {
        const err = validateDatasetName(name)
        if (err) {
          return err
        }

        return true
      },
    })
  }
}
