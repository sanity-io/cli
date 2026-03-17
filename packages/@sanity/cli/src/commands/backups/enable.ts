import {styleText} from 'node:util'

import {Args} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {type DatasetsResponse} from '@sanity/client'

import {assertDatasetExists} from '../../actions/backup/assertDatasetExist.js'
import {NEW_DATASET_VALUE, promptForDataset} from '../../prompts/promptForDataset.js'
import {promptForDatasetName} from '../../prompts/promptForDatasetName.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {setBackup} from '../../services/backup.js'
import {createDataset, listDatasets} from '../../services/datasets.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

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

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to enable backups for',
      semantics: 'override',
    }),
  }

  static override hiddenAliases: string[] = ['backup:enable']

  public async run(): Promise<void> {
    const {args} = await this.parse(EnableBackupCommand)
    let {dataset} = args

    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [
            {grant: 'read', permission: 'sanity.project.datasets'},
            {grant: 'update', permission: 'sanity.project.datasets'},
          ],
        }),
    })

    let datasets: DatasetsResponse

    try {
      datasets = await listDatasets(projectId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      enableBackupDebug(`Failed to list datasets: ${message}`, error)
      this.error(`Failed to list datasets: ${message}`, {exit: 1})
    }

    const hasProduction = datasets.some((dataset) => dataset.name === 'production')

    if (datasets.length === 0) {
      this.error('No datasets found in this project.', {exit: 1})
    }

    if (dataset) {
      assertDatasetExists(datasets, dataset)
    } else {
      dataset = await promptForDataset({allowCreation: true, datasets})

      if (dataset === NEW_DATASET_VALUE) {
        const newDatasetName = await promptForDatasetName({
          default: hasProduction ? undefined : 'production',
        })

        try {
          await createDataset({
            datasetName: newDatasetName,
            projectId,
          })
          dataset = newDatasetName
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          enableBackupDebug(`Failed to create dataset ${newDatasetName}: ${message}`, error)
          this.error(`Failed to create dataset ${newDatasetName}: ${message}`, {exit: 1})
        }
      }
    }

    try {
      await setBackup({dataset, projectId, status: true})

      this.log(
        `${styleText(
          'green',
          `Enabled backups for dataset ${dataset}.\nPlease note that it may take up to 24 hours before the first backup is created.\n`,
        )}`,
      )

      this.log(
        `${styleText('bold', `Retention policies may apply depending on your plan and agreement.\n`)}`,
      )

      enableBackupDebug(`Successfully enabled backup for dataset ${dataset}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      enableBackupDebug(`Failed to enable backup for dataset`, error)
      this.error(`Enabling dataset backup failed: ${message}`, {exit: 1})
    }
  }
}
