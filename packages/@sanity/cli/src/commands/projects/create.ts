import {Args, Flags} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {getGlobalCliClient, SanityCommand, subdebug} from '@sanity/cli-core'
import {confirm, spinner} from '@sanity/cli-core/ux'
import {DatasetResponse} from '@sanity/client'

import {createDataset} from '../../actions/dataset/create.js'
import {validateDatasetName} from '../../actions/dataset/validateDatasetName.js'
import {getOrganization} from '../../actions/organizations/getOrganization.js'
import {formatProjectUrl} from '../../actions/projects/formatProjectUrl.js'
import {promptForDatasetName} from '../../prompts/promptForDatasetName.js'
import {promptForDefaultConfig} from '../../prompts/promptForDefaultConfig.js'
import {promptForProjectName} from '../../prompts/promptForProjectName.js'
import {listDatasets} from '../../services/datasets.js'
import {getProjectFeatures} from '../../services/getProjectFeatures.js'
import {OrganizationCreateResponse, ProjectOrganization} from '../../services/organizations.js'
import {createProject, CreateProjectResult, PROJECTS_API_VERSION} from '../../services/projects.js'
import {getCliUser} from '../../services/user.js'

const debug = subdebug('projects:create')

export class CreateProjectCommand extends SanityCommand<typeof CreateProjectCommand> {
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
      parse: async (input) => {
        const datasetNameError = validateDatasetName(input)
        if (datasetNameError) {
          throw new CLIError(datasetNameError, {exit: 1})
        }

        return input
      },
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
    const {dataset, 'dataset-visibility': datasetVisibility, organization, yes} = flags
    const user = await getCliUser()

    const finalProjectName =
      projectName ||
      (yes || this.isUnattended() ? 'My Sanity Project' : await promptForProjectName())

    debug('Creating project with options: %O', {
      dataset,
      datasetVisibility,
      organizationId: organization,
      projectName,
      unattended: yes,
    })

    let chosenOrganization: OrganizationCreateResponse | ProjectOrganization | undefined
    try {
      chosenOrganization = await getOrganization(
        organization,
        user,
        this.output,
        this.isUnattended(),
      )
    } catch (error) {
      const errorText = organization
        ? `Failed to retrieve organization ${organization}`
        : 'Failed to retrieve an organization'
      this.error(`${errorText}: ${error}`, {exit: 1})
    }

    const spin = spinner('Creating project').start()
    let newProject
    try {
      newProject = await createProject({
        displayName: finalProjectName,
        metadata: {
          integration: 'cli',
        },
        organizationId: chosenOrganization?.id,
      })
      spin.succeed('Project created successfully')
    } catch (error) {
      spin.fail()
      debug(`Failed to create project: ${error}`)
      this.error(`Failed to create project: ${error}`, {exit: 1})
    }

    const newDataset = await this.handleDatasetCreation(
      newProject.projectId,
      dataset,
      datasetVisibility,
    )

    this.printProjectCreationSuccess(chosenOrganization, newProject, newDataset)
  }

  private async handleDatasetCreation(
    projectId: string,
    datasetFromFlag?: string,
    datasetVisibility?: string,
  ): Promise<DatasetResponse | undefined> {
    try {
      let datasetName: string | undefined = datasetFromFlag

      // Prompt for dataset in interactive mode if not provided
      if (!datasetName && !this.isUnattended()) {
        const wantsDataset = await confirm({
          default: true,
          message: 'Would you like to create a dataset?',
        })

        if (wantsDataset) {
          const defaultConfig = await promptForDefaultConfig(this.output)

          if (defaultConfig) {
            datasetName = 'production'
          } else {
            const datasets = await listDatasets(projectId)
            const datasetNames = datasets.map((ds) => ds.name)
            datasetName = await promptForDatasetName({}, datasetNames)
          }
        }
      }

      // Create dataset if we have a name
      if (datasetName) {
        const projectFeatures = await getProjectFeatures(projectId)
        return await createDataset({
          datasetName,
          isUnattended: this.isUnattended(),
          output: this.output,
          projectFeatures,
          projectId,
          visibility: datasetVisibility,
        })
      }

      return
    } catch (error) {
      debug(`Error creating dataset: ${error}`)
      this.warn(`Project created but dataset creation failed: ${error}`)
      return
    }
  }

  private async printProjectCreationSuccess(
    organization: OrganizationCreateResponse | ProjectOrganization | undefined,
    project: CreateProjectResult,
    dataset: DatasetResponse | undefined,
  ) {
    if (this.flags.json) {
      this.log(JSON.stringify(project, null, 2))
      return
    }

    this.log(`Project created successfully!`)
    this.log(`ID: ${project.projectId}`)
    this.log(`Name: ${project.displayName}`)
    this.log(`Organization: ${organization?.name || 'Personal'}`)

    if (dataset) {
      this.log(`Dataset: ${dataset.datasetName} (${dataset.aclMode})`)
    }

    const {apiHost} = (
      await getGlobalCliClient({apiVersion: PROJECTS_API_VERSION, requireUser: false})
    ).config()

    this.log(``)
    this.log(`Manage your project: ${formatProjectUrl(project.projectId, apiHost)}`)
  }
}
