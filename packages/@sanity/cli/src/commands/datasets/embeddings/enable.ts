import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'

import {resolveDataset} from '../../../actions/dataset/resolveDataset.js'
import {promptForProject} from '../../../prompts/promptForProject.js'
import {getEmbeddingsSettings, setEmbeddingsSettings} from '../../../services/embeddings.js'
import {getProjectIdFlag} from '../../../util/sharedFlags.js'

const debug = subdebug('dataset:embeddings:enable')

const INITIAL_POLL_INTERVAL_MS = 10_000
const MAX_POLL_INTERVAL_MS = 10 * 60 * 1000
const POLL_TIMEOUT_MS = 24 * 60 * 60 * 1000

export class DatasetEmbeddingsEnableCommand extends SanityCommand<
  typeof DatasetEmbeddingsEnableCommand
> {
  static override args = {
    dataset: Args.string({
      description: 'Dataset name to enable embeddings for',
      required: false,
    }),
  }

  static override description = 'Enable embeddings for a dataset'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> production',
      description: 'Enable embeddings for the production dataset',
    },
    {
      command: '<%= config.bin %> <%= command.id %> production --projection "{ title, body }"',
      description: 'Enable embeddings with a specific projection',
    },
    {
      command: '<%= config.bin %> <%= command.id %> production --wait',
      description: 'Enable embeddings and wait for processing to complete',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to enable embeddings for',
      semantics: 'override',
    }),
    projection: Flags.string({
      description: 'GROQ projection defining which fields to embed (e.g. "{ title, body }")',
      required: false,
    }),
    wait: Flags.boolean({
      default: false,
      description: 'Wait for embeddings processing to complete before returning',
    }),
  }

  static override hiddenAliases: string[] = ['dataset:embeddings:enable']

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(DatasetEmbeddingsEnableCommand)
    let {dataset} = args
    const {projection, wait} = flags

    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [
            {grant: 'read', permission: 'sanity.project.datasets'},
            {grant: 'update', permission: 'sanity.project.datasets'},
          ],
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
      await setEmbeddingsSettings({dataset, enabled: true, projectId, projection})
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      debug(`Failed to enable embeddings: ${message}`, error)
      this.error(`Failed to enable embeddings: ${message}`, {exit: 1})
    }

    this.log(styleText('green', `Embeddings enabled for dataset ${dataset}.`))
    if (projection) {
      this.log(`Projection: ${projection}`)
    }

    if (wait) {
      await this.waitForReady(projectId, dataset)
    } else {
      this.log('Processing documents in the background. Use --wait to wait for completion.')
    }
  }

  private async waitForReady(projectId: string, dataset: string): Promise<void> {
    const spin = spinner('Waiting for embeddings to be ready...').start()
    const deadline = Date.now() + POLL_TIMEOUT_MS
    let interval = INITIAL_POLL_INTERVAL_MS

    while (Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, interval))
      interval = Math.min(interval * 1.5, MAX_POLL_INTERVAL_MS)

      let settings
      try {
        settings = await getEmbeddingsSettings(projectId, dataset)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        spin.fail('Failed while waiting for embeddings.')
        this.error(`Failed while waiting for embeddings: ${message}`, {exit: 1})
      }
      debug(`Poll status: ${settings.status}, next interval: ${Math.round(interval)}ms`)

      if (settings.status === 'ready') {
        spin.succeed('Embeddings ready.')
        return
      }

      if (settings.status !== 'updating') {
        spin.fail(`Unexpected status: ${settings.status}`)
        this.error(`Embeddings entered unexpected status: ${settings.status}`, {exit: 1})
      }

      spin.text = 'Still processing...'
    }

    spin.fail('Timed out waiting for embeddings.')
    this.error('Timed out. Check status with: sanity dataset embeddings status', {exit: 1})
  }
}
