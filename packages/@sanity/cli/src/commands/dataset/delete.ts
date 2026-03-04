import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {input, logSymbols} from '@sanity/cli-core/ux'

import {validateDatasetName} from '../../actions/dataset/validateDatasetName.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {deleteDataset} from '../../services/datasets.js'
import {getProjectById} from '../../services/projects.js'
import {projectIdFlag} from '../../util/sharedFlags.js'

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
    ...projectIdFlag,
    force: Flags.boolean({
      description: 'Do not prompt for delete confirmation - forcefully delete',
      required: false,
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(DeleteDatasetCommand)
    const {force} = flags

    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [{grant: 'delete', permission: 'sanity.project.datasets'}],
        }),
    })

    const datasetName = args.datasetName

    const dsError = validateDatasetName(datasetName)
    if (dsError) {
      this.error(dsError, {exit: 1})
    }

    if (force) {
      this.warn(`'--force' used: skipping confirmation, deleting dataset "${datasetName}"`)
    } else {
      try {
        const project = await getProjectById(projectId)
        this.log(
          styleText(
            'yellow',
            `${logSymbols.warning} Deleting dataset "${styleText(['bold', 'underline'], datasetName)}" from project "${styleText(['bold', 'underline'], project.displayName)} (${styleText(['bold', 'underline'], project.id)})"\n`,
          ),
        )
      } catch (error) {
        const err = error instanceof Error ? error : new Error(`${error}`)
        deleteDatasetDebug(`Error getting project ${projectId}`, err)
        this.error(`Project retrieval failed: ${err.message}`, {exit: 1})
      }

      try {
        await input({
          message:
            'Are you ABSOLUTELY sure you want to delete this dataset?\n  Type the name of the dataset to confirm delete:',
          validate: (input) => {
            const trimmed = input.trim()
            return trimmed === datasetName || 'Incorrect dataset name. Ctrl + C to cancel delete.'
          },
        })
      } catch (error) {
        const err = error instanceof Error ? error : new Error(`${error}`)
        deleteDatasetDebug(`User cancelled`, err)
        this.error(`User cancelled`, {exit: 1})
      }
    }

    try {
      await deleteDataset({datasetName, projectId})
      this.log('Dataset deleted successfully')
    } catch (error) {
      const err = error instanceof Error ? error : new Error(`${error}`)
      deleteDatasetDebug(`Error deleting dataset ${datasetName}`, err)
      this.error(`Dataset deletion failed: ${err.message}`, {exit: 1})
    }
  }
}
