import {Args} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'

import {resolveDataset} from '../../../actions/dataset/resolveDataset.js'
import {promptForProject} from '../../../prompts/promptForProject.js'
import {getEmbeddingsSettings} from '../../../services/embeddings.js'
import {getProjectIdFlag} from '../../../util/sharedFlags.js'

const debug = subdebug('dataset:embeddings:status')

export class DatasetEmbeddingsStatusCommand extends SanityCommand<
  typeof DatasetEmbeddingsStatusCommand
> {
  static override args = {
    dataset: Args.string({
      description: 'The name of the dataset to check embeddings status for',
      required: false,
    }),
  }

  static override description = 'Show embeddings settings and status for a dataset'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> production',
      description: 'Show embeddings status for the production dataset',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to check embeddings status for (overrides CLI configuration)',
    }),
  }

  public async run(): Promise<void> {
    const {args} = await this.parse(DatasetEmbeddingsStatusCommand)
    let {dataset} = args

    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [{grant: 'read', permission: 'sanity.project.datasets'}],
        }),
    })

    try {
      ;({dataset} = await resolveDataset({dataset, projectId}))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      debug(`Failed to resolve dataset: ${message}`, error)
      this.error(message, {exit: 1})
    }

    try {
      const settings = await getEmbeddingsSettings(projectId, dataset)

      this.log(`Dataset:    ${dataset}`)
      this.log(`Embeddings: ${settings.enabled ? 'enabled' : 'disabled'}`)
      if (settings.projection) {
        this.log(`Projection: ${settings.projection}`)
      }
      this.log(`Status:     ${settings.status}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      debug(`Failed to get embeddings settings: ${message}`, error)
      this.error(`Failed to get embeddings settings: ${message}`, {exit: 1})
    }
  }
}
