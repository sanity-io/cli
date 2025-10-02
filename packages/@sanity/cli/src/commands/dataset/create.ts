import {select} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {type DatasetAclMode} from '@sanity/client'

import {validateDatasetName} from '../../actions/dataset/validateDatasetName.js'
import {promptForDatasetName} from '../../prompts/promptForDatasetName.js'
import {createDataset, listDatasets} from '../../services/datasets.js'
import {getProjectFeatures} from '../../services/getProjectFeatures.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const createDatasetDebug = subdebug('dataset:create')

const ALLOWED_ACL_MODES = ['custom', 'private', 'public']

export class CreateDatasetCommand extends SanityCommand<typeof CreateDatasetCommand> {
  static override args = {
    name: Args.string({
      description: 'Name of the dataset to create',
      required: false,
    }),
  }

  static override description = 'Create a new dataset within your project'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Interactively create a dataset',
    },
    {
      command: '<%= config.bin %> <%= command.id %> my-dataset',
      description: 'Create a dataset named "my-dataset"',
    },
    {
      command: '<%= config.bin %> <%= command.id %> my-dataset --visibility private',
      description: 'Create a private dataset named "my-dataset"',
    },
  ]

  static override flags = {
    visibility: Flags.string({
      description: 'Set visibility for this dataset (custom/private/public)',
      options: ALLOWED_ACL_MODES,
      required: false,
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(CreateDatasetCommand)
    const {visibility} = flags

    // Ensure we have project context
    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    // Get dataset name from args or prompt
    let {name: datasetName} = args
    if (datasetName) {
      const nameError = validateDatasetName(datasetName)
      if (nameError) {
        this.error(nameError, {exit: 1})
      }
    } else {
      datasetName = await promptForDatasetName()
    }

    let datasets: string[]
    let projectFeatures: string[]

    try {
      const [datasetsResponse, featuresResponse] = await Promise.all([
        listDatasets(projectId),
        getProjectFeatures(projectId),
      ])
      datasets = datasetsResponse.map((ds) => ds.name)
      projectFeatures = featuresResponse
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      createDatasetDebug(`Failed to fetch project data: ${message}`, error)
      this.error(`Failed to fetch project data: ${message}`, {exit: 1})
    }

    if (datasets.includes(datasetName)) {
      this.error(`Dataset "${datasetName}" already exists`, {exit: 1})
    }

    const canCreatePrivate = projectFeatures.includes('privateDataset')
    createDatasetDebug('%s create private datasets', canCreatePrivate ? 'Can' : 'Cannot')

    const aclMode = await this.determineAclMode(visibility, canCreatePrivate)

    try {
      await createDataset({aclMode, datasetName, projectId})
      this.log('Dataset created successfully')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      createDatasetDebug(`Error creating dataset ${datasetName}`, error)
      this.error(`Dataset creation failed: ${message}`, {exit: 1})
    }
  }

  private async determineAclMode(
    visibility: string | undefined,
    canCreatePrivate: boolean,
  ): Promise<DatasetAclMode> {
    if (visibility === 'custom' || visibility === 'public') {
      return visibility
    }

    // Handle private visibility request
    if (visibility === 'private') {
      if (canCreatePrivate) {
        return 'private'
      }
      // Private requested but not available
      this.warn('Private datasets are not available for this project. Creating as public.')
      return 'public'
    }

    if (canCreatePrivate) {
      return this.promptForDatasetVisibility()
    }

    // Default to public when no flag and no private capability
    return 'public'
  }

  private async promptForDatasetVisibility(): Promise<'private' | 'public'> {
    const mode = await select({
      choices: [
        {
          name: 'Public (world readable)',
          value: 'public' as const,
        },
        {
          name: 'Private (Authenticated user or token needed)',
          value: 'private' as const,
        },
      ],
      message: 'Dataset visibility',
    })

    if (mode === 'private') {
      this.warn(
        'Please note that while documents are private, assets (files and images) are still public',
      )
    }

    return mode
  }
}
