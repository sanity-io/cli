import {Args} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'

import {validateDatasetName} from '../../../actions/dataset/validateDatasetName.js'
import {promptForProject} from '../../../prompts/promptForProject.js'
import {listDatasets} from '../../../services/datasets.js'
import {getProjectIdFlag} from '../../../util/sharedFlags.js'

const getDebug = subdebug('dataset:visibility:get')

export class DatasetVisibilityGetCommand extends SanityCommand<typeof DatasetVisibilityGetCommand> {
  static override args = {
    dataset: Args.string({
      description: 'The name of the dataset to get visibility for',
      required: true,
    }),
  }

  static override description = 'Get the visibility of a dataset'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> my-dataset',
      description: 'Check the visibility of a dataset',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to get dataset visibility for',
      semantics: 'override',
    }),
  }

  static override hiddenAliases: string[] = ['dataset:visibility:get']

  public async run(): Promise<void> {
    const {args} = await this.parse(DatasetVisibilityGetCommand)
    const {dataset} = args

    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [{grant: 'read', permission: 'sanity.project.datasets'}],
        }),
    })

    const dsError = validateDatasetName(dataset)
    if (dsError) {
      this.error(dsError, {exit: 1})
    }

    let current
    try {
      const datasets = await listDatasets(projectId)
      current = datasets.find((curr: {name: string}) => curr.name === dataset)
    } catch (error) {
      getDebug(`Error listing datasets`, error)
      this.error(
        `Failed to list datasets: ${error instanceof Error ? error.message : String(error)}`,
        {exit: 1},
      )
    }

    if (!current) {
      this.error(`Dataset not found: ${dataset}`, {exit: 1})
    }

    this.log(current.aclMode)
  }
}
