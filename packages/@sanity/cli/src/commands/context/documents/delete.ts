import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {confirm} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {deleteDocument} from '../../../services/context.js'

const deleteDocumentDebug = subdebug('context:documents:delete')

export class DeleteDocumentCommand extends SanityCommand<typeof DeleteDocumentCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
    // eslint-disable-next-line perfectionist/sort-objects -- positional order: knowledge base first
    documentId: Args.string({
      description: 'Document ID',
      required: true,
    }),
  }

  static override description =
    'Delete a document from its source. A page still on the website comes back on the next sync unless the crawl options exclude it'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 document-def456',
      description: 'Delete a document after confirmation',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 document-def456 --yes',
      description: 'Delete a document without confirmation prompt',
    },
  ]

  static override flags = {
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description: 'Skip confirmation prompt (unattended mode)',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {documentId, knowledgeBaseId} = this.args
    const {yes: skipConfirmation} = this.flags

    if (this.isUnattended() && !skipConfirmation) {
      this.error('Deletion requires confirmation. Pass `--yes` to delete the document.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    if (!skipConfirmation) {
      const confirmed = await confirm({
        default: false,
        message: `Delete document "${documentId}"?`,
      })

      if (!confirmed) {
        this.log('Document not deleted')
        this.exit(exitCodes.USER_ABORT)
      }
    }

    try {
      await deleteDocument(knowledgeBaseId, documentId)
      this.log('Document deleted')
    } catch (error) {
      deleteDocumentDebug('Error deleting document', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Document "${documentId}" not found on knowledge base "${knowledgeBaseId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to delete document: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
