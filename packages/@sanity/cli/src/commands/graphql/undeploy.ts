import {Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'

import {getGraphQLAPIs} from '../../actions/graphql/getGraphQLAPIs.js'
import {SchemaError} from '../../actions/graphql/SchemaError.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {deleteGraphQLAPI} from '../../services/graphql.js'
import {getDatasetFlag, getProjectIdFlag} from '../../util/sharedFlags.js'

const undeployGraphqlDebug = subdebug('graphql:undeploy')

export class Undeploy extends SanityCommand<typeof Undeploy> {
  static override description = 'Remove a deployed GraphQL API'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Undeploy GraphQL API for current project and dataset',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --api ios',
      description: 'Undeploy API with ID "ios"',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --dataset staging',
      description: 'Undeploy GraphQL API for staging dataset',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --dataset staging --tag next',
      description: 'Undeploy GraphQL API for staging dataset with "next" tag',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --force',
      description: 'Undeploy GraphQL API without confirmation prompt',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --project-id abc123 --dataset production',
      description: 'Undeploy GraphQL API for a specific project and dataset',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to undeploy GraphQL API from (overrides CLI configuration)',
    }),
    api: Flags.string({
      description: 'Undeploy API with this ID',
      exclusive: ['project-id', 'project'],
      required: false,
    }),
    ...getDatasetFlag({description: 'Dataset to undeploy GraphQL API from'}),
    force: Flags.boolean({
      description: 'Skip confirmation prompt',
      required: false,
    }),
    project: Flags.string({
      deprecated: {to: 'project-id'},
      description: 'Project ID to delete GraphQL API for',
      hidden: true,
      required: false,
    }),
    tag: Flags.string({
      default: 'default',
      description: 'Tag to undeploy GraphQL API from',
      required: false,
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Undeploy)
    const {api: apiFlag, dataset: datasetFlag, force, tag: tagFlag} = flags

    let projectId: string | undefined
    let dataset = datasetFlag
    let tag = tagFlag

    // If specifying --api, use it for the flags not provided
    if (apiFlag) {
      const workDir = process.cwd()
      let apiDefs
      try {
        apiDefs = await getGraphQLAPIs(workDir)
      } catch (error) {
        if (error instanceof SchemaError) {
          error.print(this.output)
          this.error('Fix the schema errors above and try again', {exit: 1})
        }
        throw error
      }
      const apiDef = apiDefs.find((def) => def.id === apiFlag)

      if (!apiDef) {
        this.error(`GraphQL API "${apiFlag}" not found`, {exit: 1})
      }

      projectId = apiDef.projectId

      if (dataset && dataset !== apiDef.dataset) {
        this.warn(`Both --api and --dataset specified, using --dataset ${dataset}`)
      } else {
        dataset = apiDef.dataset
      }

      if (tag && tag !== 'default' && apiDef.tag && tag !== apiDef.tag) {
        this.warn(`Both --api and --tag specified, using --tag ${tag}`)
      } else {
        tag = apiDef.tag || 'default'
      }
    }

    // Get projectId from config if not specified
    if (!projectId) {
      projectId = await this.getProjectId({
        deprecatedFlagName: 'project',
        fallback: () =>
          promptForProject({
            requiredPermissions: [{grant: 'manage', permission: 'sanity.project.graphql'}],
          }),
      })
    }

    // Get dataset from CLI config if not specified
    if (!dataset) {
      const cliConfig = await this.tryGetCliConfig()
      dataset = cliConfig.api?.dataset
    }

    if (!dataset) {
      this.error(
        'Dataset is required. Specify it with --dataset or configure it in your project.',
        {
          exit: 1,
        },
      )
    }

    // Confirm deletion unless --force is used
    if (!force) {
      const confirmMessage =
        tag === 'default'
          ? `Are you absolutely sure you want to delete the current GraphQL API connected to the "${dataset}" dataset in project ${projectId}?`
          : `Are you absolutely sure you want to delete the GraphQL API connected to the "${dataset}" dataset in project ${projectId}, tagged "${tag}"?`

      try {
        const confirmed = await confirm({
          default: false,
          message: confirmMessage,
        })

        if (!confirmed) {
          this.log('Operation cancelled')
          return
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(`${error}`)
        undeployGraphqlDebug('User cancelled', err)
        this.error('Operation cancelled', {exit: 1})
      }
    }

    try {
      await deleteGraphQLAPI({
        dataset,
        projectId,
        tag,
      })

      this.log('GraphQL API deleted')
    } catch (error) {
      const err = error instanceof Error ? error : new Error(`${error}`)
      undeployGraphqlDebug(`Error deleting GraphQL API for ${dataset}/${tag}`, err)
      this.error(`GraphQL API deletion failed:\n${err.message}`, {exit: 1})
    }
  }
}
