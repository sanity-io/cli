import {Args, Flags} from '@oclif/core'
import {colorizeJson, getProjectCliClient, SanityCommand, subdebug} from '@sanity/cli-core'

import {DOCUMENTS_API_VERSION} from '../../actions/documents/constants.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {getDatasetFlag, getProjectIdFlag} from '../../util/sharedFlags.js'

const queryDocumentDebug = subdebug('documents:query')

export class QueryDocumentCommand extends SanityCommand<typeof QueryDocumentCommand> {
  static override args = {
    query: Args.string({
      description: 'GROQ query to run against the dataset',
      required: true,
    }),
  }

  static override description = 'Query for documents'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> \'*[_type == "movie"][0..4]\'',
      description: 'Fetch 5 documents of type "movie"',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> \'*[_type == "movie"]|order(releaseDate asc)[0]{title}\' --dataset staging',
      description: 'Fetch title of the oldest movie in the dataset named "staging"',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> \'*[_id == "header"] { "headerText": pt::text(body) }\' --api-version v2021-06-07',
      description: 'Use API version v2021-06-07 and do a query',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> \'*[_type == "post"]\' --project-id abc123 --dataset production',
      description: 'Query documents in a specific project and dataset',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({description: 'Project ID to query (overrides CLI configuration)'}),
    ...getDatasetFlag({description: 'Dataset to query (overrides CLI configuration)'}),
    anonymous: Flags.boolean({
      default: false,
      description: 'Send the query without any authorization token',
    }),
    'api-version': Flags.string({
      description: `API version to use (defaults to ${DOCUMENTS_API_VERSION})`,
      env: 'SANITY_CLI_QUERY_API_VERSION',
    }),
    pretty: Flags.boolean({
      default: false,
      description: 'Colorize JSON output',
    }),
    project: Flags.string({
      deprecated: {to: 'project-id'},
      description: 'Project ID to query (overrides CLI configuration)',
      hidden: true,
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(QueryDocumentCommand)
    const {query} = args
    const {
      anonymous,
      'api-version': apiVersion,
      dataset,
      pretty,
    } = flags

    const cliConfig = await this.tryGetCliConfig()

    const projectId = await this.getProjectId({
      deprecatedFlagName: 'project',
      fallback: () => promptForProject({}),
    })

    const requireUser = !anonymous

    if (!cliConfig.api?.dataset && !dataset) {
      this.error(
        'No dataset specified. Either configure a dataset in sanity.cli.ts or use the --dataset flag',
        {exit: 1},
      )
    }

    const targetDataset = dataset || cliConfig.api?.dataset
    const targetApiVersion = apiVersion || DOCUMENTS_API_VERSION

    if (!apiVersion) {
      this.warn(`--api-version not specified, using \`${DOCUMENTS_API_VERSION}\``)
    }

    try {
      const projectClient = await getProjectCliClient({
        apiVersion: targetApiVersion,
        dataset: targetDataset,
        projectId,
        requireUser,
      })

      const docs = await projectClient.fetch(query)

      if (!docs) {
        this.error('Query returned no results', {exit: 1})
      }

      // Output the query results
      if (pretty) {
        this.log(colorizeJson(docs))
      } else {
        this.log(JSON.stringify(docs, null, 2))
      }
    } catch (error) {
      const err = error as Error

      queryDocumentDebug(`Error running query: ${query}`, err)

      // Provide more context in error messages
      const errorMsg = err.message.toLowerCase().includes('syntax')
        ? `Invalid GROQ query syntax: ${err.message}`
        : `Failed to run query: ${err.message}`

      this.error(`${errorMsg}\nQuery: ${query}`, {exit: 1})
    }
  }
}
