import {Args} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'

import {validateDatasetAliasName} from '../../../actions/dataset/validateDatasetAliasName.js'
import {validateDatasetName} from '../../../actions/dataset/validateDatasetName.js'
import {promptForDatasetAliasName} from '../../../prompts/promptForDatasetAliasName.js'
import {selectDataset} from '../../../prompts/selectDataset.js'
import {ALIAS_PREFIX, createAlias, listAliases} from '../../../services/datasetAliases.js'
import {listDatasets} from '../../../services/datasets.js'
import {getProjectFeatures} from '../../../services/getProjectFeatures.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'

const createAliasDebug = subdebug('dataset:alias:create')

export class CreateAliasCommand extends SanityCommand<typeof CreateAliasCommand> {
  static override args = {
    aliasName: Args.string({
      description: 'Dataset alias name to create',
      required: false,
    }),
    targetDataset: Args.string({
      description: 'Target dataset name to link the alias to',
      required: false,
    }),
  }

  static override description = 'Create a dataset alias within your project'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Create an alias with interactive prompts',
    },
    {
      command: '<%= config.bin %> <%= command.id %> conference',
      description: 'Create alias named "conference" with interactive dataset selection',
    },
    {
      command: '<%= config.bin %> <%= command.id %> conference conf-2025',
      description: 'Create alias "conference" linked to "conf-2025" dataset',
    },
    {
      command: '<%= config.bin %> <%= command.id %> ~conference conf-2025',
      description: 'Create alias with explicit ~ prefix',
    },
  ]

  public async run(): Promise<void> {
    const {args} = await this.parse(CreateAliasCommand)

    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    let canCreateAlias = false
    try {
      const features = await getProjectFeatures(projectId)
      canCreateAlias = features.includes('advancedDatasetManagement')
    } catch (error) {
      createAliasDebug(`Error getting project features`, error)
      this.error('Failed to get project features', {exit: 1})
    }
    if (!canCreateAlias) {
      this.error('This project cannot create a dataset alias - see https://www.sanity.io/pricing', {exit: 1})
    }

    if (args.aliasName) {
      const nameError = validateDatasetAliasName(args.aliasName)
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

      const datasets = datasetsResponse.map((ds: {name: string}) => ds.name)
      const existingAliases = aliases.map((alias: {name: string}) => alias.name)

      let aliasName = args.aliasName || (await promptForDatasetAliasName())
      let aliasOutputName = aliasName

      if (aliasName.startsWith(ALIAS_PREFIX)) {
        aliasName = aliasName.slice(1)
      } else {
        aliasOutputName = `${ALIAS_PREFIX}${aliasName}`
      }

      if (existingAliases.includes(aliasName)) {
        this.error(`Dataset alias "${aliasOutputName}" already exists`, {exit: 1})
      }

      const targetDataset =
        args.targetDataset || (datasets.length > 0 ? await selectDataset(datasets) : null)

      if (targetDataset && !datasets.includes(targetDataset)) {
        this.error(
          `Dataset "${targetDataset}" does not exist. Available datasets: ${datasets.join(', ')}`,
          {exit: 1},
        )
      }

      await createAlias(projectId, aliasName, targetDataset)

      const linkMessage = targetDataset ? ` and linked to ${targetDataset}` : ''
      this.log(`Dataset alias ${aliasOutputName} created${linkMessage} successfully`)
    } catch (error) {
      createAliasDebug(`Error creating dataset alias`, error)
      this.error(
        `Dataset alias creation failed: ${error instanceof Error ? error.message : String(error)}`,
        {exit: 1},
      )
    }
  }
}
