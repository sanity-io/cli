import {SanityCommand} from '@sanity/cli-core'
import {Args, Flags} from '@oclif/core'
import {createClient} from '@sanity/client'
import chalk from 'chalk'

import {NO_PROJECT_ID} from '../../util/errorMessages.js'

export class Get extends SanityCommand<typeof Get> {
  static override description = 'Get and print a document by ID'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> myDocId',
      description: 'Get the document with ID "myDocId"',
    },
    {
      command: '<%= config.bin %> <%= command.id %> myDocId --pretty',
      description: 'Get document with colorized JSON output',
    },
    {
      command: '<%= config.bin %> <%= command.id %> myDocId --dataset production',
      description: 'Get document from a specific dataset',
    },
  ]

  static override args = {
    documentId: Args.string({
      description: 'Document ID to retrieve',
      required: true,
    }),
  }

  static override flags = {
    pretty: Flags.boolean({
      description: 'Colorize JSON output',
      default: false,
    }),
    dataset: Flags.string({
      description: 'Dataset to get document from (overrides config)',
      char: 'd',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(Get)
    const {documentId} = args
    const {pretty, dataset} = flags

    // Get project configuration
    const cliConfig = await this.getCliConfig()
    const projectId = await this.getProjectId()

    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    if (!cliConfig.api?.dataset && !dataset) {
      this.error('No dataset specified. Either configure a dataset in sanity.cli.ts or use the --dataset flag', {exit: 1})
    }

    const targetDataset = dataset || cliConfig.api?.dataset

    try {
      // Create a client configured for the project and dataset
      const client = createClient({
        projectId,
        dataset: targetDataset,
        apiVersion: '2023-05-03', // Use a stable API version for document operations
        useCdn: false, // Don't use CDN for document operations
        requestTagPrefix: 'sanity.cli',
      })

      const doc = await client.getDocument(documentId)

      if (!doc) {
        this.error(`Document "${documentId}" not found in dataset "${targetDataset}"`, {exit: 1})
      }

      // Output the document
      if (pretty) {
        this.log(colorizeJson(doc))
      } else {
        this.log(JSON.stringify(doc, null, 2))
      }
    } catch (error) {
      const err = error as Error
      this.error(`Failed to fetch document: ${err.message}`, {exit: 1})
    }
  }
}

/**
 * Colorize JSON output for better readability
 */
function colorizeJson(obj: unknown): string {
  const json = JSON.stringify(obj, null, 2)
  
  return json
    .replace(/"([^"]+)":/g, chalk.blue('"$1"') + ':') // Keys in blue
    .replace(/: "([^"]+)"/g, ': ' + chalk.green('"$1"')) // String values in green
    .replace(/: (\d+)/g, ': ' + chalk.yellow('$1')) // Numbers in yellow
    .replace(/: (true|false|null)/g, ': ' + chalk.magenta('$1')) // Booleans/null in magenta
}