import {Args, Flags} from '@oclif/core'
import {defineDataset} from '@sanity/blueprints'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'

import {
  getBlueprintForScope,
  printBlueprintResource,
} from '../../actions/blueprints/prepareResource.js'
import {createDataset} from '../../actions/dataset/create.js'
import {validateDatasetName} from '../../actions/dataset/validateDatasetName.js'
import {resolveProjectForCommand} from '../../actions/targets/blueprintCommandTarget.js'
import {promptForDatasetName} from '../../prompts/promptForDatasetName.js'
import {listDatasets} from '../../services/datasets.js'
import {getProjectFeatures} from '../../services/getProjectFeatures.js'
import {getProjectIdFlag, getWithBlueprintsFlag} from '../../util/sharedFlags.js'
import {defineCommandTelemetry} from '../../util/telemetry/commandTelemetry.js'

const createDatasetDebug = subdebug('dataset:create')

const ALLOWED_ACL_MODES = ['custom', 'private', 'public']

export class CreateDatasetCommand extends SanityCommand<typeof CreateDatasetCommand> {
  static override args = {
    name: Args.string({
      description: 'Name of the dataset to create',
      required: false,
    }),
  }

  static override description = 'Create a new dataset for the project'

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
    ...getWithBlueprintsFlag(),
    ...getProjectIdFlag({
      description: 'Project ID to create dataset in',
      semantics: 'override',
    }),
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

  static override hiddenAliases: string[] = ['dataset:create']

  static telemetry = defineCommandTelemetry(this.flags, {redact: ['embeddings-projection']})

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(CreateDatasetCommand)
    const {visibility} = flags

    // Ensure we have project context
    const projectId = await resolveProjectForCommand(this, this.flags, [
      {grant: 'read', permission: 'sanity.project.datasets'},
      {grant: 'create', permission: 'sanity.project.datasets'},
    ])

    // Get dataset name from args or prompt
    let {name: datasetName} = args
    if (datasetName) {
      const nameError = validateDatasetName(datasetName)
      if (nameError) {
        this.error(nameError, {exit: exitCodes.USAGE_ERROR})
      }
    } else {
      if (this.isUnattended()) {
        this.error('Dataset name is required. Pass it as the `<name>` argument.', {
          exit: exitCodes.USAGE_ERROR,
        })
      }
      datasetName = await promptForDatasetName()
    }

    if (this.flags['with-blueprints']) {
      const blueprintPath = await getBlueprintForScope({id: projectId, type: 'project'})
      if (flags.embeddings) {
        this.error(
          'Blueprints cannot set dataset embeddings. Declare the dataset first, then run `sanity datasets embeddings enable`.',
          {
            exit: exitCodes.USAGE_ERROR,
          },
        )
      }
      printBlueprintResource(
        this.output,
        blueprintPath,
        defineDataset({
          aclMode: visibility === 'custom' || visibility === 'private' ? visibility : 'public',
          datasetName,
          name: datasetName,
          project: projectId,
        }),
      )
      return
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
      this.error(`Failed to fetch project data: ${message}`, {exit: exitCodes.RUNTIME_ERROR})
    }

    if (datasets.includes(datasetName)) {
      this.error(`Dataset "${datasetName}" already exists`, {exit: exitCodes.RUNTIME_ERROR})
    }

    const canCreatePrivate = projectFeatures.includes('privateDataset')
    createDatasetDebug('%s create private datasets', canCreatePrivate ? 'Can' : 'Cannot')

    try {
      await createDataset({
        datasetName,
        embeddings: flags.embeddings,
        embeddingsProjection: flags['embeddings-projection'],
        isUnattended: this.isUnattended(),
        output: this.output,
        projectFeatures,
        projectId,
        visibility,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.error(`Failed to create dataset: ${message}`, {exit: exitCodes.RUNTIME_ERROR})
    }
  }
}
