import {styleText} from 'node:util'

import {Args} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'

import {resolveDataset} from '../../../actions/dataset/resolveDataset.js'
import {setEmbeddingsSettings} from '../../../services/embeddings.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'

const debug = subdebug('dataset:embeddings:disable')

export class DatasetEmbeddingsDisableCommand extends SanityCommand<
  typeof DatasetEmbeddingsDisableCommand
> {
  static override args = {
    dataset: Args.string({
      description: 'Dataset name to disable embeddings for',
      required: false,
    }),
  }

  static override description = 'Disable embeddings for a dataset'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> production',
      description: 'Disable embeddings for the production dataset',
    },
  ]

  public async run(): Promise<void> {
    const {args} = await this.parse(DatasetEmbeddingsDisableCommand)
    let {dataset} = args

    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    try {
      ;({dataset} = await resolveDataset({dataset, projectId}))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      debug(`Failed to resolve dataset: ${message}`, error)
      this.error(message, {exit: 1})
    }

    try {
      await setEmbeddingsSettings({dataset, enabled: false, projectId})
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      debug(`Failed to disable embeddings: ${message}`, error)
      this.error(`Failed to disable embeddings: ${message}`, {exit: 1})
    }

    this.log(styleText('green', `Disabled embeddings for dataset ${dataset}.`))
    this.log(styleText('yellow', 'Note: Existing embedding data will be removed.'))
  }
}
