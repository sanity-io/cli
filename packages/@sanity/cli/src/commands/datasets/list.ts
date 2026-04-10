import {SanityCommand, subdebug} from '@sanity/cli-core'

import {promptForProject} from '../../prompts/promptForProject.js'
import {listDatasetAliases, listDatasets} from '../../services/datasets.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

const listDatasetDebug = subdebug('dataset:list')

export class ListDatasetCommand extends SanityCommand<typeof ListDatasetCommand> {
  static override description = 'List datasets for the project'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List datasets for the project',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --project-id abc123',
      description: 'List datasets for a specific project',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to list datasets for',
      semantics: 'override',
    }),
  }

  static override hiddenAliases: string[] = ['dataset:list']

  public async run(): Promise<void> {
    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [{grant: 'read', permission: 'sanity.project.datasets'}],
        }),
    })

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
      listDatasetDebug(`Warning: Could not fetch aliases for project ${projectId}`, aliases.reason)
    }
  }
}
