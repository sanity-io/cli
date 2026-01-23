import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {confirm, spinner} from '@sanity/cli-core/ux'

import {createDataset} from '../../actions/dataset/create.js'
import {getOrganizationId} from '../../actions/organizations/getOrganizationId.js'
import {promptForDatasetName} from '../../prompts/promptForDatasetName.js'
import {promptForProjectName} from '../../prompts/promptForProjectName.js'
import {getProjectFeatures} from '../../services/getProjectFeatures.js'
import {createProject} from '../../services/projects.js'
import {getCliUser} from '../../services/user.js'

const debug = subdebug('projects:create')

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
      description: 'Create a dataset. Prompts for visibility unless specified or --yes used',
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
    const user = await getCliUser()

    const finalProjectName =
      projectName ||
      projectName ||
      (yes || this.isUnattended() ? 'My Sanity Project' : await promptForProjectName())

    debug('Creating project with options: %O', {
      dataset,
      datasetVisibility,
      organizationId: organization,
      projectName,
      unattended: yes,
    })

    const organizationId = await getOrganizationId(organization, user, this.output)

    const spin = spinner('Creating project').start()
    const newProject = await createProject({
      displayName: finalProjectName,
      metadata: {
        integration: 'cli',
      },
      organizationId,
    })
    spin.succeed('Project created successfully')

    let datasetName: string | undefined = dataset

    if (!datasetName && !this.isUnattended()) {
      const wantsDataset = await confirm({
        default: true,
        message: 'Would you like to create a dataset?',
      })
      if (wantsDataset) {
        datasetName = await promptForDatasetName()
      }
    }

    // Create dataset if we have a name
    if (datasetName) {
      const projectFeatures = await getProjectFeatures(newProject.projectId)
      await createDataset({
        datasetName,
        isUnattended: this.isUnattended(),
        output: this.output,
        projectFeatures,
        projectId: newProject.projectId,
        visibility: datasetVisibility,
      })
    }

    if (json) {
      this.log(JSON.stringify(newProject, null, 2))
      return
    }
  }
}
