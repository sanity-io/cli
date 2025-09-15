import {SanityCommand, subdebug} from '@sanity/cli-core'

import {listDatasetAliases, listDatasets} from '../../services/datasets.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const listDatasetDebug = subdebug('dataset:list')

export class ListDatasetCommand extends SanityCommand<typeof ListDatasetCommand> {
  static override description = 'List datasets of your project'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List datasets of your project',
    },
  ]

  public async run(): Promise<void> {
    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    try {
      const [datasets, aliases] = await Promise.allSettled([
        listDatasets(projectId),
        listDatasetAliases(projectId),
      ])

      if (datasets.status === 'rejected') {
        const err = datasets.reason as Error
        listDatasetDebug(`Error listing datasets for project ${projectId}`, err)
        this.error(`Dataset list retrieval failed: ${err.message}`, {exit: 1})
      }

      const datasetList = datasets.value
      if (datasetList.length === 0) {
        this.log('No datasets found for this project.')
      } else {
        for (const dataset of datasetList) {
          this.log(dataset.name)
        }
      }

      if (aliases.status === 'fulfilled' && aliases.value.length > 0) {
        for (const alias of aliases.value) {
          const targetDataset = alias.datasetName || '<unlinked>'
          this.log(`~${alias.name} -> ${targetDataset}`)
        }
      } else if (aliases.status === 'rejected') {
        listDatasetDebug(
          `Warning: Could not fetch aliases for project ${projectId}`,
          aliases.reason,
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      listDatasetDebug(`Error listing datasets for project ${projectId}`, error)
      this.error(`Dataset list retrieval failed: ${message}`, {exit: 1})
    }
  }
}
