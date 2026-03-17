import {Args} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {DatasetsResponse} from '@sanity/client'

import {validateDatasetName} from '../../../actions/dataset/validateDatasetName.js'
import {promptForProject} from '../../../prompts/promptForProject.js'
import {editDatasetAcl, listDatasets} from '../../../services/datasets.js'
import {getProjectIdFlag} from '../../../util/sharedFlags.js'

const setDatasetVisibilityDebug = subdebug('dataset:visibility:set')

export class DatasetVisibilitySetCommand extends SanityCommand<typeof DatasetVisibilitySetCommand> {
  static override args = {
    dataset: Args.string({
      description: 'The name of the dataset to set visibility for',
      required: true,
    }),
    mode: Args.string({
      description: 'The visibility mode to set',
      options: ['public', 'private'],
      required: true,
    }),
  }

  static override description = 'Set the visibility of a dataset'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> my-dataset private',
      description: 'Make a dataset private',
    },
    {
      command: '<%= config.bin %> <%= command.id %> my-dataset public',
      description: 'Make a dataset public',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to set dataset visibility for',
      semantics: 'override',
    }),
  }

  static override hiddenAliases: string[] = ['dataset:visibility:set']

  public async run(): Promise<void> {
    const {args} = await this.parse(DatasetVisibilitySetCommand)
    const {dataset, mode} = args

    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [
            {grant: 'read', permission: 'sanity.project.datasets'},
            {grant: 'update', permission: 'sanity.project.datasets'},
          ],
        }),
    })

    const dsError = validateDatasetName(dataset)
    if (dsError) {
      this.error(dsError, {exit: 1})
    }

    let datasets: DatasetsResponse

    try {
      datasets = await listDatasets(projectId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setDatasetVisibilityDebug(`Failed to list datasets: ${message}`, error)
      this.error(`Failed to list datasets: ${message}`, {exit: 1})
    }

    const current = datasets.find((curr: {name: string}) => curr.name === dataset)

    if (!current) {
      this.error(`Dataset "${dataset}" not found`, {exit: 1})
    }

    if (current.aclMode === mode) {
      this.log(`Dataset already in "${mode}" mode`)
      return
    }

    if (mode === 'private') {
      this.log(
        'Please note that while documents are private, assets (files and images) are still public',
      )
    }

    try {
      await editDatasetAcl({
        aclMode: mode as 'private' | 'public',
        datasetName: dataset,
        projectId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setDatasetVisibilityDebug(`Failed to edit dataset: ${message}`, error)
      this.error(`Failed to edit dataset: ${message}`, {exit: 1})
    }
    this.log('Dataset visibility changed')
  }
}
