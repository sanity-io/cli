import {Args} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {formatKeyValue} from '../../../actions/debug/output.js'
import {getDocument} from '../../../services/context.js'

const getDocumentDebug = subdebug('context:documents:get')

export class GetDocumentCommand extends SanityCommand<typeof GetDocumentCommand> {
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

  static override description = 'Get details of a document, with the chunks of its markdown'

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 document-def456',
      description: 'Get details of a document',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 document-def456 --json',
      description: 'Output the document, including its chunks, as JSON',
    },
  ]

  public async run(): Promise<void> {
    const {documentId, knowledgeBaseId} = this.args
    const {json} = this.flags

    let document
    try {
      document = await getDocument(knowledgeBaseId, documentId)
    } catch (error) {
      getDocumentDebug('Error getting document', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Document "${documentId}" not found on knowledge base "${knowledgeBaseId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to get document: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (json) {
      this.logJson(document)
      return
    }

    const padTo = 11 // "Source type" and "External ID" are the longest keys
    this.log(formatKeyValue('ID', document.id, {padTo}))
    this.log(formatKeyValue('Title', document.title, {padTo}))
    this.log(formatKeyValue('Source', document.sourceId, {padTo}))
    this.log(formatKeyValue('Source type', document.sourceType, {padTo}))
    this.log(formatKeyValue('External ID', document.externalId, {padTo}))
    this.log(formatKeyValue('URL', document.url ?? '-', {padTo}))
    this.log(formatKeyValue('State', document.state, {padTo}))
    this.log(
      formatKeyValue(
        'Conversion',
        document.conversionError
          ? `${document.conversion}: ${document.conversionError}`
          : document.conversion,
        {padTo},
      ),
    )
    this.log(formatKeyValue('MIME type', document.mime ?? '-', {padTo}))
    this.log(formatKeyValue('Size', String(document.sizeBytes ?? '-'), {padTo}))
    this.log(formatKeyValue('Chunks', String(document.chunks.length), {padTo}))
    this.log(formatKeyValue('Last seen', document.lastSeenAt, {padTo}))
    this.log(formatKeyValue('Created', document.createdAt, {padTo}))
    this.log(formatKeyValue('Updated', document.updatedAt, {padTo}))
  }
}
