import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {input, logSymbols} from '@sanity/cli-core/ux'

import {validateDatasetName} from '../../actions/dataset/validateDatasetName.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {deleteDataset} from '../../services/datasets.js'
import {getProjectById} from '../../services/projects.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

const deleteDatasetDebug = subdebug('dataset:delete')

export class DeleteDatasetCommand extends SanityCommand<typeof DeleteDatasetCommand> {
  static override args = {
    datasetName: Args.string({
      description: 'Dataset name to delete',
      required: true,
    }),
  }

  static override description = 'Delete a dataset from the project'

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
    ...getProjectIdFlag({
      description: 'Project ID to delete dataset from',
      semantics: 'override',
    }),
    force: Flags.boolean({
      description: 'Do not prompt for delete confirmation - forcefully delete',
      required: false,
    }),
  }

  static override hiddenAliases: string[] = ['dataset:delete']

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
      this.error(dsError, {exit: exitCodes.USAGE_ERROR})
    }

    if (force) {
      this.warn(`'--force' used: skipping confirmation, deleting dataset "${datasetName}"`)
    } else {
      if (this.isUnattended()) {
        this.error('Dataset deletion requires confirmation. Re-run with `--force`.', {
          exit: exitCodes.USAGE_ERROR,
        })
      }
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
        this.error(`Project retrieval failed: ${err.message}`, {exit: exitCodes.RUNTIME_ERROR})
      }

      await input({
        message: `Delete dataset "${datasetName}"?\n  Type the dataset name to confirm:`,
        validate: (input) => {
          const trimmed = input.trim()
          return (
            trimmed === datasetName ||
            `Dataset name doesn't match. Enter "${datasetName}" or press Ctrl+C to cancel.`
          )
        },
      })
    }

    try {
      await deleteDataset({datasetName, projectId})
      this.log('Dataset deleted successfully')
    } catch (error) {
      const err = error instanceof Error ? error : new Error(`${error}`)
      deleteDatasetDebug(`Error deleting dataset ${datasetName}`, err)
      this.error(`Dataset deletion failed: ${err.message}`, {exit: exitCodes.RUNTIME_ERROR})
    }
  }
}
