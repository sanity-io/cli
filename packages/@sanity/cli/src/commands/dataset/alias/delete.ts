import {input} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'

import {validateDatasetAliasName} from '../../../actions/dataset/validateDatasetAliasName.js'
import {ALIAS_PREFIX, listAliases, removeAlias} from '../../../services/datasetAliases.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'

const deleteAliasDebug = subdebug('dataset:alias:delete')

export class DeleteAliasCommand extends SanityCommand<typeof DeleteAliasCommand> {
  static override args = {
    aliasName: Args.string({
      description: 'Dataset alias name to delete',
      required: true,
    }),
  }

  static override description = 'Delete a dataset alias within your project'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> staging',
      description: 'Delete alias "staging" with confirmation prompt',
    },
    {
      command: '<%= config.bin %> <%= command.id %> ~staging',
      description: 'Delete alias with explicit ~ prefix',
    },
    {
      command: '<%= config.bin %> <%= command.id %> staging --force',
      description: 'Delete alias "staging" without confirmation prompt',
    },
  ]

  static override flags = {
    force: Flags.boolean({
      description: 'Skip confirmation prompt and delete immediately',
      required: false,
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(DeleteAliasCommand)
    const {force} = flags

    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    const {apiName, displayName} = this.processAliasName(args.aliasName)

    const nameError = validateDatasetAliasName(apiName)
    if (nameError) {
      this.error(nameError, {exit: 1})
    }

    try {
      const aliases = await listAliases(projectId)
      const existingAlias = aliases.find((alias) => alias.name === apiName)

      if (!existingAlias) {
        this.error(`Dataset alias "${displayName}" does not exist`, {exit: 1})
      }

      if (force) {
        this.warn(`'--force' used: skipping confirmation, deleting alias "${displayName}"`)
      } else {
        await this.confirmDeletion(displayName, existingAlias.datasetName)
      }

      await removeAlias(projectId, apiName)

      this.log('Dataset alias deleted successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      deleteAliasDebug(`Error deleting dataset alias ${args.aliasName}`, error)
      this.error(`Dataset alias deletion failed: ${errorMessage}`, {exit: 1})
    }
  }

  private async confirmDeletion(aliasName: string, linkedDataset?: string | null): Promise<void> {
    const message = linkedDataset
      ? `This dataset alias is linked to ${linkedDataset}. Are you ABSOLUTELY sure you want to delete this dataset alias?\n  Type the name of the dataset alias to confirm delete:`
      : `Are you ABSOLUTELY sure you want to delete this dataset alias?\n  Type the name of the dataset alias to confirm delete:`

    await input({
      message,
      validate: (input) => {
        const trimmed = input.trim()
        return trimmed === aliasName || 'Incorrect dataset alias name. Ctrl + C to cancel delete.'
      },
    })
  }

  /**
   * Processes the alias name to handle the optional ~ prefix
   * @param aliasName - The raw alias name from user input
   * @returns Object containing apiName (without ~) and displayName (with ~)
   */
  private processAliasName(aliasName: string): {apiName: string; displayName: string} {
    let apiName = aliasName
    let displayName = aliasName

    if (aliasName.startsWith(ALIAS_PREFIX)) {
      apiName = aliasName.slice(1)
    } else {
      displayName = `${ALIAS_PREFIX}${aliasName}`
    }

    return {apiName, displayName}
  }
}
