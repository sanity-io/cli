import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'

import {createProjectAction} from '../../actions/projects/createProjectAction.js'
import {printProjectCreationSuccess} from '../../util/projectUtils.js'
import {promptForProjectName} from '../../prompts/promptForProjectName.js'
import {getOrganizationId} from '../../actions/organizations/getOrganizationId.js'

const createProjectDebug = subdebug('projects:create')

export default class CreateProjectCommand extends SanityCommand<typeof CreateProjectCommand> {
  static override args = {
    projectName: Args.string({
      description: 'Name of the project to create',
      required: false,
    }),
  }

  static override description = 'Create a new Sanity project'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Interactively create a project',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "My New Project"',
      description: 'Create a project named "My New Project"',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "My Project" --organization=my-org',
      description: 'Create a project in a specific organization',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "My Project" --dataset',
      description: 'Create a project with a dataset (will prompt for details)',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> "My Project" --dataset=staging --dataset-visibility=private',
      description: 'Create a project with a private dataset named "staging"',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "CI Project" --yes --json',
      description: 'Create a project non-interactively with JSON output',
    },
  ]

  static override flags = {
    dataset: Flags.string({
      allowNo: false,
      description: 'Create a dataset. Prompts for name/visibility unless specified or --yes used',
      required: false,
    }),
    'dataset-visibility': Flags.string({
      description: 'Dataset visibility: public or private',
      options: ['private', 'public'],
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output in JSON format',
    }),
    organization: Flags.string({
      description: 'Organization to create the project in',
      helpValue: '<slug|id>',
    }),
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description:
        'Skip prompts and use defaults (project: "My Sanity Project", dataset: production, visibility: public)',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(CreateProjectCommand)
    const {projectName} = args
    const {dataset, 'dataset-visibility': datasetVisibility, json, organization, yes} = flags
    const getCliUse

    const finalProjectName =
      projectName ||
      projectName ||
      (yes || this.isUnattended() ? 'My Sanity Project' : await promptForProjectName())

    // Get organization
    const organization = await getOrganizationId()

    // Parse dataset options
    let datasetName: string | undefined
    let createDataset = false

    if (dataset === '') {
      // --dataset flag without value - let action handle prompting
      createDataset = true
      datasetName = undefined
    } else if (typeof dataset === 'string') {
      // --dataset=name
      createDataset = true
      datasetName = dataset
    }

    try {
      createProjectDebug('Creating project with options: %O', {
        createDataset,
        datasetName,
        datasetVisibility,
        organizationId: organization,
        projectName,
        unattended: yes,
      })

      const result = await createProjectAction({
        createDataset,
        datasetName,
        datasetVisibility: datasetVisibility as 'private' | 'public' | undefined,
        organizationId: organization,
        projectName,
        unattended: yes,
      })

      if (json) {
        this.log(JSON.stringify(result, null, 2))
        return
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      createProjectDebug('Failed to create project: %s', message, error)
      this.error(`Failed to create project: ${message}`, {exit: 1})
    }
  }

  private async
}
