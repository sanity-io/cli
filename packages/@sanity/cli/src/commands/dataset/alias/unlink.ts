import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {input} from '@sanity/cli-core/ux'

import {processAliasName} from '../../../actions/dataset/processAliasName.js'
import {validateDatasetAliasName} from '../../../actions/dataset/validateDatasetAliasName.js'
import {promptForDatasetAliasName} from '../../../prompts/promptForDatasetAliasName.js'
import {promptForProject} from '../../../prompts/promptForProject.js'
import {listAliases, unlinkAlias} from '../../../services/datasetAliases.js'
import {projectIdFlag} from '../../../util/sharedFlags.js'

const unlinkAliasDebug = subdebug('dataset:alias:unlink')

export class UnlinkAliasCommand extends SanityCommand<typeof UnlinkAliasCommand> {
  static override args = {
    aliasName: Args.string({
      description: 'Dataset alias name to unlink',
      required: false,
    }),
  }

  static override description = 'Unlink a dataset alias from its dataset within your project'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Unlink an alias with interactive selection',
    },
    {
      command: '<%= config.bin %> <%= command.id %> conference',
      description: 'Unlink alias "conference" with confirmation prompt',
    },
    {
      command: '<%= config.bin %> <%= command.id %> ~conference',
      description: 'Unlink alias with explicit ~ prefix',
    },
    {
      command: '<%= config.bin %> <%= command.id %> conference --force',
      description: 'Unlink alias "conference" without confirmation prompt',
    },
  ]

  static override flags = {
    ...projectIdFlag,
    force: Flags.boolean({
      description: 'Skip confirmation prompt and unlink immediately',
      required: false,
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(UnlinkAliasCommand)
    const {force} = flags

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
      const aliasNameInput = args.aliasName || (await promptForDatasetAliasName())
      const {apiName, displayName} = processAliasName(aliasNameInput)

      const nameError = validateDatasetAliasName(apiName)
      if (nameError) {
        this.error(nameError, {exit: 1})
      }

      const aliases = await listAliases(projectId)

      // get the current alias from the remote alias list
      const linkedAlias = aliases.find((elem) => elem.name === apiName)
      if (!linkedAlias) {
        this.error(`Dataset alias "${displayName}" does not exist`, {exit: 1})
      }

      if (!linkedAlias.datasetName) {
        this.error(`Dataset alias "${displayName}" is not linked to a dataset`, {exit: 1})
      }

      if (force) {
        this.warn(`'--force' used: skipping confirmation, unlinking alias "${displayName}"`)
      } else {
        await this.confirmUnlink(linkedAlias.datasetName)
      }

      const result = await unlinkAlias(projectId, apiName)
      this.log(`Dataset alias ${displayName} unlinked from ${result.datasetName} successfully`)
    } catch (error) {
      unlinkAliasDebug('Error unlinking dataset alias', error)
      this.error(
        `Dataset alias unlink failed: ${error instanceof Error ? error.message : String(error)}`,
        {exit: 1},
      )
    }
  }

  private async confirmUnlink(datasetName: string): Promise<void> {
    await input({
      message: `Are you ABSOLUTELY sure you want to unlink this alias from the "${datasetName}" dataset?\n  Type YES/NO:`,
      validate: (input) => {
        const response = input.toLowerCase().trim()
        return (
          response === 'yes' || 'Type YES to confirm or Ctrl + C to cancel dataset alias unlink.'
        )
      },
    })
  }
}
