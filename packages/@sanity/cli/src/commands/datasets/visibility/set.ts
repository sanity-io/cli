import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {confirm, NonInteractiveError} from '@sanity/cli-core/ux'
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
      command: '<%= config.bin %> <%= command.id %> my-dataset public --yes',
      description: 'Make a dataset public without a confirmation prompt',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to set dataset visibility for',
      semantics: 'override',
    }),
    yes: Flags.boolean({
      char: 'y',
      description:
        'Skip the confirmation prompt when changing a dataset to public. Required for non-interactive usage (e.g. CI or agents).',
      required: false,
    }),
  }

  static override hiddenAliases: string[] = ['dataset:visibility:set']

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(DatasetVisibilitySetCommand)
    const {dataset, mode} = args
    const {yes: skipConfirmation} = flags

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

    if (mode === 'public') {
      this.warn(
        `You are about to make "${dataset}" PUBLIC. Anyone on the internet will be able to read all documents and assets in this dataset without authentication. If this dataset contains any sensitive, personal, or proprietary data, cancel now and keep it private.`,
      )

      if (skipConfirmation) {
        this.log(`--yes acknowledged: skipping confirmation and changing "${dataset}" to public`)
      } else {
        try {
          const confirmed = await confirm({
            default: false,
            message: `Are you sure you want to make "${dataset}" public?`,
          })
          if (!confirmed) {
            this.log('Operation cancelled')
            return
          }
        } catch (error) {
          if (error instanceof NonInteractiveError) {
            this.error(
              'Refusing to change dataset to public in a non-interactive environment without the --yes flag. Re-run with --yes to acknowledge that the data will be readable by anyone on the internet.',
              {exit: 1},
            )
          }
          throw error
        }
      }
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
