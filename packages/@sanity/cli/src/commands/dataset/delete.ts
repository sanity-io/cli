import {input} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'

import {validateDatasetName} from '../../actions/dataset/validateDatasetName.js'
import {deleteDataset} from '../../services/datasets.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const deleteDatasetDebug = subdebug('dataset:delete')

export class DeleteDatasetCommand extends SanityCommand<typeof DeleteDatasetCommand> {
  static override args = {
    datasetName: Args.string({
      description: 'Dataset name to delete',
      required: true,
    }),
  }

  static override description = 'Delete a dataset within your project'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> my-dataset',
      description: 'Delete a specific dataset',
    },
    {
      command: '<%= config.bin %> <%= command.id %> my-dataset --force',
      description: 'Delete a specific dataset without confirmation',
    },
  ]

  static override flags = {
    force: Flags.boolean({
      description: 'Do not prompt for delete confirmation - forcefully delete',
      required: false,
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(DeleteDatasetCommand)
    const {force} = flags

    // Ensure we have project context
    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    // Get the dataset name to delete (now required)
    const datasetName = args.datasetName

    // Validate dataset name
    const dsError = validateDatasetName(datasetName)
    if (dsError) {
      this.error(dsError, {exit: 1})
    }

    // Confirmation logic
    if (force) {
      this.warn(`'--force' used: skipping confirmation, deleting dataset "${datasetName}"`)
    } else {
      await input({
        message:
          'Are you ABSOLUTELY sure you want to delete this dataset?\n  Type the name of the dataset to confirm delete:',
        validate: (input) => {
          const trimmed = input.trim()
          return trimmed === datasetName || 'Incorrect dataset name. Ctrl + C to cancel delete.'
        },
      })
    }

    // Delete the dataset
    try {
      await deleteDataset({datasetName, projectId})
      this.log('Dataset deleted successfully')
    } catch (error) {
      const err = error as Error
      deleteDatasetDebug(`Error deleting dataset ${datasetName}`, err)
      this.error(`Dataset deletion failed: ${err.message}`, {exit: 1})
    }
  }
}
