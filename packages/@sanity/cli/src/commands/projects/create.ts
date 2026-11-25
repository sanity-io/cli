import {Args, Flags} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {exitCodes} from '@sanity/cli-core'
import {subdebug} from '@sanity/cli-core/debug'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {type ImageFile, readImageFile} from '@sanity/cli-core/images'
import {SanityCommand} from '@sanity/cli-core/SanityCommand'
import {confirm, spinner} from '@sanity/cli-core/ux'
import {type DatasetResponse} from '@sanity/client'

import {createDataset} from '../../actions/dataset/create.js'
import {validateDatasetName} from '../../actions/dataset/validateDatasetName.js'
import {getOrganization} from '../../actions/organizations/getOrganization.js'
import {getManageUrl} from '../../actions/projects/getManageUrl.js'
import {promptForDatasetName} from '../../prompts/promptForDatasetName.js'
import {promptForDefaultConfig} from '../../prompts/promptForDefaultConfig.js'
import {promptForProjectName} from '../../prompts/promptForProjectName.js'
import {listDatasets} from '../../services/datasets.js'
import {getProjectFeatures} from '../../services/getProjectFeatures.js'
import {
  type OrganizationCreateResponse,
  type ProjectOrganization,
} from '../../services/organizations.js'
import {createProject, type CreateProjectResult, setProjectLogo} from '../../services/projects.js'
import {getCliUser} from '../../services/user.js'
import {defineCommandTelemetry} from '../../util/telemetry/commandTelemetry.js'

const debug = subdebug('projects:create')

export class CreateProjectCommand extends SanityCommand<typeof CreateProjectCommand> {
  static override args = {
    projectName: Args.string({
      description: 'Name of the project to create',
      required: false,
    }),
  }

  static override description = 'Create a new Sanity project'

  static override enableJsonFlag = true

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
      command:
        '<%= config.bin %> <%= command.id %> "My Project" --dataset=staging --dataset-visibility=private',
      description: 'Create a project with a private dataset named "staging"',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "My Project" --logo ./logo.png',
      description: 'Create a project with a logo',
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
          throw new CLIError(datasetNameError, {exit: exitCodes.USAGE_ERROR})
        }

        return input
      },
    }),
    'dataset-visibility': Flags.string({
      description: 'Dataset visibility: public or private',
      options: ['private', 'public'],
    }),
    logo: Flags.string({
      description:
        'Image file to use as the logo: PNG, JPEG, GIF, WebP, SVG, BMP, TIFF, HEIF or AVIF, at most 5 MB',
      helpValue: '<path>',
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

  static override hiddenAliases: string[] = ['project:create']

  static telemetry = defineCommandTelemetry(this.flags, {redact: ['logo']})

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(CreateProjectCommand)
    const {projectName} = args
    const {
      dataset,
      'dataset-visibility': datasetVisibility,
      logo: logoPath,
      organization,
      yes,
    } = flags

    // Read the logo before creating anything, so a bad file doesn't leave a project without it.
    let logo: ImageFile | undefined
    if (logoPath === '') {
      return this.output.error(
        '--logo needs the path to an image file. To create the project without a logo, leave out --logo.',
        {exit: exitCodes.RUNTIME_ERROR},
      )
    } else if (logoPath !== undefined) {
      try {
        logo = await readImageFile(logoPath)
      } catch (error) {
        return this.output.error(getErrorMessage(error), {exit: exitCodes.RUNTIME_ERROR})
      }
    }

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
      chosenOrganization = await getOrganization({
        isUnattended: this.isUnattended(),
        output: this.output,
        requestedId: organization,
        user,
      })
    } catch (error) {
      const errorText = organization
        ? `Failed to retrieve organization ${organization}`
        : 'Failed to retrieve an organization'
      return this.output.error(`${errorText}: ${error}`, {exit: exitCodes.RUNTIME_ERROR})
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
      return this.output.error(`Failed to create project: ${error}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    let logoUrl: string | undefined
    if (logo) {
      const logoSpin = spinner('Setting logo').start()
      try {
        logoUrl = (await setProjectLogo(newProject.projectId, logo)).logoUrl
        logoSpin.succeed()
      } catch (error) {
        logoSpin.fail()
        debug(`Error setting project logo: ${error}`)
        this.output.logDiagnostic(
          `Warning: Project created but its logo wasn't set: ${getErrorMessage(error)}\nTo set it, go to ${getManageUrl(newProject.projectId)}`,
        )
      }
    }

    let newDataset: DatasetResponse | undefined
    // If dataset name specified, or in attended mode (to prompt for dataset name), create a dataset.
    if (dataset || !this.isUnattended()) {
      newDataset = await this.handleDatasetCreation(
        newProject.projectId,
        dataset,
        datasetVisibility,
      )
    }

    this.printProjectCreationSuccess(chosenOrganization, newProject, newDataset, logoUrl)
  }

  private async handleDatasetCreation(
    projectId: string,
    datasetFromFlag?: string,
    datasetVisibility?: string,
  ): Promise<DatasetResponse | undefined> {
    try {
      let datasetName: string | undefined = datasetFromFlag
      const existingDatasets = await listDatasets(projectId)
      const existingDatasetNames = existingDatasets.map((ds) => ds.name)

      // Prompt for dataset in interactive mode if not provided
      if (!datasetName && !this.isUnattended()) {
        const wantsDataset = await confirm({
          default: true,
          message: 'Would you like to create a dataset?',
        })

        if (wantsDataset) {
          const defaultConfig = await promptForDefaultConfig()

          datasetName = defaultConfig
            ? 'production'
            : await promptForDatasetName({}, existingDatasetNames)
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
          silent: this.flags.json,
          visibility: datasetVisibility,
        })
      }

      return
    } catch (error) {
      debug(`Error creating dataset: ${error}`)
      this.output.logDiagnostic(`Warning: Project created but dataset creation failed: ${error}`)
      return
    }
  }

  private async printProjectCreationSuccess(
    organization: OrganizationCreateResponse | ProjectOrganization | undefined,
    project: CreateProjectResult,
    dataset: DatasetResponse | undefined,
    logoUrl: string | undefined,
  ) {
    if (this.flags.json) {
      this.logJson(logoUrl ? {...project, logoUrl} : project)
      return
    }

    this.output.log(`Project created successfully!`)
    this.output.log(`ID: ${project.projectId}`)
    this.output.log(`Name: ${project.displayName}`)
    this.output.log(`Organization: ${organization?.name || 'Personal'}`)

    if (dataset) {
      this.output.log(`Dataset: ${dataset.datasetName} (${dataset.aclMode})`)
    }

    if (logoUrl) {
      this.output.log(`Logo: ${logoUrl}`)
    }

    this.output.log(``)
    this.output.log(`Manage your project: ${getManageUrl(project.projectId)}`)
  }
}
