import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'

import {createDataset} from '../../actions/dataset/create.js'
import {validateDatasetName} from '../../actions/dataset/validateDatasetName.js'
import {promptForDatasetName} from '../../prompts/promptForDatasetName.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {listDatasets} from '../../services/datasets.js'
import {getProjectFeatures} from '../../services/getProjectFeatures.js'
import {projectIdFlag} from '../../util/sharedFlags.js'

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
    ...projectIdFlag,
    embeddings: Flags.boolean({
      default: false,
      description: 'Enable embeddings for this dataset',
    }),
    'embeddings-projection': Flags.string({
      dependsOn: ['embeddings'],
      description: 'GROQ projection for embeddings indexing (e.g. "{ title, body }")',
    }),
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
    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [
            {grant: 'read', permission: 'sanity.project.datasets'},
            {grant: 'create', permission: 'sanity.project.datasets'},
          ],
        }),
    })

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

    try {
      await createDataset({
        datasetName,
        embeddings: flags.embeddings,
        embeddingsProjection: flags['embeddings-projection'],
        output: this.output,
        projectFeatures,
        projectId,
        visibility,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.error(`Failed to create dataset: ${message}`, {exit: 1})
    }
  }
}
