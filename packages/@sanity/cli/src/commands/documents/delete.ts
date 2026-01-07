import {Args, Flags} from '@oclif/core'
import {getProjectCliClient, SanityCommand, subdebug} from '@sanity/cli-core'

import {DOCUMENTS_API_VERSION} from '../../actions/documents/constants.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const deleteDocumentDebug = subdebug('documents:delete')

export class DeleteDocumentCommand extends SanityCommand<typeof DeleteDocumentCommand> {
  static override args = {
    id: Args.string({
      description: 'Document ID to delete',
      required: true,
    }),
    ids: Args.string({
      description: 'Additional document IDs to delete',
      required: false,
    }),
  }

  static override description = 'Delete one or more documents from the projects configured dataset'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> myDocId',
      description: 'Delete the document with the ID "myDocId"',
    },
    {
      command: "<%= config.bin %> <%= command.id %> 'myDocId'",
      description: 'ID wrapped in double or single quote works equally well',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --dataset=blog someDocId',
      description: 'Delete document with ID "someDocId" from dataset "blog"',
    },
    {
      command: '<%= config.bin %> <%= command.id %> doc1 doc2',
      description: 'Delete the document with ID "doc1" and "doc2"',
    },
  ]

  static override flags = {
    dataset: Flags.string({
      description: 'NAME to override dataset',
    }),
  }

  // Disable strict mode to allow for more flexible input
  // This is needed for supporting multiple document IDs
  static override strict = false

  public async run(): Promise<void> {
    const {args, argv, flags} = await this.parse(DeleteDocumentCommand)
    const {id} = args
    const {dataset} = flags

    // Collect all document IDs from args and argv
    const ids = [id, ...argv.slice(1)].filter(Boolean) as string[]

    if (ids.length === 0) {
      this.error('Document ID must be specified', {exit: 1})
    }

    // Get project configuration
    const cliConfig = await this.getCliConfig()
    const projectId = await this.getProjectId()

    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

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

      const transaction = projectClient.transaction()
      for (const id of ids) {
        transaction.delete(id)
      }
      const {results} = await transaction.commit()
      const deleted = results.filter((res) => res.operation === 'delete').map((res) => res.id)
      const notFound = ids.filter((id) => !deleted.includes(id))

      if (deleted.length > 0) {
        this.log(`Deleted ${deleted.length} ${deleted.length === 1 ? 'document' : 'documents'}`)
      }

      if (notFound.length > 0) {
        this.error(
          `${notFound.length === 1 ? 'Document' : 'Documents'} not found: ${notFound.join(', ')}`,
          {
            exit: 1,
          },
        )
      }
    } catch (error) {
      const err = error as Error
      deleteDocumentDebug(`Error deleting documents ${ids.join(', ')}`, err)
      this.error(
        `Failed to delete ${ids.length} ${ids.length === 1 ? 'document' : 'documents'}: ${err.message}`,
        {
          exit: 1,
        },
      )
    }
  }
}
