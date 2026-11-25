import {Args} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'

import {resolveDataset} from '../../../actions/dataset/resolveDataset.js'
import {getBlueprintDatasetTarget} from '../../../actions/targets/blueprintCommandTarget.js'
import {promptForProject} from '../../../prompts/promptForProject.js'
import {getEmbeddingsSettings} from '../../../services/embeddings.js'
import {getProjectIdFlag, getWithBlueprintsFlag} from '../../../util/sharedFlags.js'

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
    ...getWithBlueprintsFlag(),
    ...getProjectIdFlag({
      description: 'Project ID to check embeddings status for',
      semantics: 'override',
    }),
  }

  static override hiddenAliases: string[] = ['dataset:embeddings:status']

  public async run(): Promise<void> {
    const {args} = await this.parse(DatasetEmbeddingsStatusCommand)
    let {dataset} = args

    const blueprintTarget = await getBlueprintDatasetTarget(
      this,
      {...this.flags, dataset: dataset},
      {
        datasetUsage: '<dataset>',
        requiredProjectPermissions: [{grant: 'read', permission: 'sanity.project.datasets'}],
      },
    )
    const projectId =
      blueprintTarget?.projectId ??
      (await this.getProjectId({
        fallback: () =>
          promptForProject({
            requiredPermissions: [{grant: 'read', permission: 'sanity.project.datasets'}],
          }),
      }))
    dataset = blueprintTarget?.dataset ?? dataset

    try {
      ;({dataset} = await resolveDataset({
        dataset,
        isUnattended: this.isUnattended(),
        output: this.output,
        projectId,
      }))
    } catch (error) {
      if (error instanceof CLIError) throw error
      const message = error instanceof Error ? error.message : String(error)
      debug(`Failed to resolve dataset: ${message}`, error)
      this.error(message, {exit: exitCodes.RUNTIME_ERROR})
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
      this.error(`Failed to get embeddings settings: ${message}`, {exit: exitCodes.RUNTIME_ERROR})
    }
  }
}
