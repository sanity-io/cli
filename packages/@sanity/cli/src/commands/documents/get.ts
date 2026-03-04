import {Args, Flags} from '@oclif/core'
import {colorizeJson, getProjectCliClient, SanityCommand, subdebug} from '@sanity/cli-core'

import {DOCUMENTS_API_VERSION} from '../../actions/documents/constants.js'

const getDocumentDebug = subdebug('documents:get')

export class GetDocumentCommand extends SanityCommand<typeof GetDocumentCommand> {
  static override args = {
    documentId: Args.string({
      description: 'Document ID to retrieve',
      required: true,
    }),
  }

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

  static override flags = {
    dataset: Flags.string({
      char: 'd',
      description: 'Dataset to get document from (overrides config)',
    }),
    pretty: Flags.boolean({
      default: false,
      description: 'Colorize JSON output',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(GetDocumentCommand)
    const {documentId} = args
    const {dataset, pretty} = flags

    // Get project configuration
    const cliConfig = await this.getCliConfig()
    const projectId = await this.getProjectId()

    if (!cliConfig.api?.dataset && !dataset) {
      this.error(
        'No dataset specified. Either configure a dataset in sanity.cli.ts or use the --dataset flag',
        {exit: 1},
      )
    }

    const targetDataset = dataset || cliConfig.api?.dataset

    try {
      const projectClient = await getProjectCliClient({
        apiVersion: DOCUMENTS_API_VERSION,
        dataset: targetDataset,
        projectId,
        requireUser: true,
      })

      const doc = await projectClient.getDocument(documentId)

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

      getDocumentDebug(`Error fetching document ${documentId}`, err)
      this.error(`Failed to fetch document: ${err.message}`, {exit: 1})
    }
  }
}
