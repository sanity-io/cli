import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {input} from '@sanity/cli-core/ux'

import {processAliasName} from '../../../actions/dataset/processAliasName.js'
import {validateDatasetAliasName} from '../../../actions/dataset/validateDatasetAliasName.js'
import {validateDatasetName} from '../../../actions/dataset/validateDatasetName.js'
import {promptForDatasetAliasName} from '../../../prompts/promptForDatasetAliasName.js'
import {promptForProject} from '../../../prompts/promptForProject.js'
import {selectDataset} from '../../../prompts/selectDataset.js'
import {listAliases, updateAlias} from '../../../services/datasetAliases.js'
import {listDatasets} from '../../../services/datasets.js'
import {getProjectIdFlag} from '../../../util/sharedFlags.js'

const linkAliasDebug = subdebug('dataset:alias:link')

export class LinkAliasCommand extends SanityCommand<typeof LinkAliasCommand> {
  static override args = {
    aliasName: Args.string({
      description: 'Dataset alias name to link',
      required: false,
    }),
    targetDataset: Args.string({
      description: 'Target dataset name to link the alias to',
      required: false,
    }),
  }

  static override description = 'Link a dataset alias to a dataset within your project'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Link an alias with interactive prompts',
    },
    {
      command: '<%= config.bin %> <%= command.id %> conference',
      description: 'Link alias named "conference" with interactive dataset selection',
    },
    {
      command: '<%= config.bin %> <%= command.id %> conference conf-2025',
      description: 'Link alias "conference" to "conf-2025" dataset',
    },
    {
      command: '<%= config.bin %> <%= command.id %> conference conf-2025 --force',
      description: 'Force link without confirmation (skip relink prompt)',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to link dataset alias in',
      semantics: 'override',
    }),
    force: Flags.boolean({
      description: 'Skip confirmation prompt when relinking existing alias',
      required: false,
    }),
  }

  static override hiddenAliases: string[] = ['dataset:alias:link']

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(LinkAliasCommand)
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

    if (args.aliasName) {
      const {apiName} = processAliasName(args.aliasName)
      const nameError = validateDatasetAliasName(apiName)
      if (nameError) {
        this.error(nameError, {exit: 1})
      }
    }

    if (args.targetDataset) {
      const datasetErr = validateDatasetName(args.targetDataset)
      if (datasetErr) {
        this.error(datasetErr, {exit: 1})
      }
    }

    try {
      const [datasetsResponse, aliases] = await Promise.all([
        listDatasets(projectId),
        listAliases(projectId),
      ])

      const datasets = datasetsResponse.map((ds) => ds.name)

      const aliasNameInput = args.aliasName || (await promptForDatasetAliasName())

      const {apiName, displayName} = processAliasName(aliasNameInput)

      const existingAlias = aliases.find((alias) => alias.name === apiName)
      if (!existingAlias) {
        const availableAliases = aliases.map((a) => `~${a.name}`).join(', ')
        this.error(
          `Dataset alias "${displayName}" does not exist. Available aliases: ${availableAliases}`,
          {exit: 1},
        )
      }

      const targetDataset =
        args.targetDataset ||
        (datasets.length > 0
          ? await selectDataset(datasets, {
              message: 'Select target dataset to link alias to:',
            })
          : null)

      if (!targetDataset) {
        this.error('No datasets available to link to', {exit: 1})
      }

      if (!datasets.includes(targetDataset)) {
        this.error(
          `Dataset "${targetDataset}" does not exist. Available datasets: ${datasets.join(', ')}`,
          {exit: 1},
        )
      }

      if (existingAlias.datasetName === targetDataset) {
        this.error(`Dataset alias ${displayName} already linked to ${targetDataset}`, {exit: 1})
      }

      if (existingAlias.datasetName && !force) {
        await this.confirmRelink(existingAlias.datasetName, targetDataset)
      } else if (force && existingAlias.datasetName) {
        this.warn(`'--force' used: skipping confirmation, linking alias to ${targetDataset}`)
      }

      await updateAlias(projectId, apiName, targetDataset)

      this.log(`Dataset alias ${displayName} linked to ${targetDataset} successfully`)
    } catch (error) {
      linkAliasDebug(`Error linking dataset alias`, error)
      this.error(
        `Dataset alias linking failed: ${error instanceof Error ? error.message : String(error)}`,
        {exit: 1},
      )
    }
  }

  private async confirmRelink(currentDataset: string, newDataset: string): Promise<void> {
    await input({
      message: `This alias is linked to dataset <${currentDataset}>. Are you ABSOLUTELY sure you want to link this dataset alias to ${newDataset}?\n  Type YES/NO:`,
      validate: (input) => {
        const response = input.toLowerCase().trim()
        return response === 'yes' || 'Type YES to confirm or Ctrl + C to cancel dataset alias link.'
      },
    })
  }
}
