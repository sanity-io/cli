import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {type Context, isHttpError} from '@sanity/client'

import {listDocuments} from '../../../services/context.js'
import {Table} from '../../../util/responsiveTable.js'

const listDocumentsDebug = subdebug('context:documents:list')

type DocumentState = Context.Document['state']

export class ListDocumentsCommand extends SanityCommand<typeof ListDocumentsCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
  }

  static override description =
    'List the pages, dataset documents and files the sources of a knowledge base yield'

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123',
      description: 'List the documents of a knowledge base (deleted ones are left out)',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> kb-abc123 --source source-def456 --state missing',
      description: "List a website source's pages that its last sync didn't find",
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --json',
      description: 'Output documents as JSON',
    },
  ]

  static override flags = {
    source: Flags.string({
      description: 'Only list the documents of this source',
      helpValue: '<sourceId>',
    }),
    state: Flags.custom<DocumentState>({
      description: 'Only list documents in this state (without it, deleted documents are left out)',
      // A Record forces every state the client knows to be listed, so the options can't drift
      options: Object.keys({
        active: true,
        deleted: true,
        missing: true,
      } satisfies Record<DocumentState, true>),
    })(),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {knowledgeBaseId} = this.args
    const {json, source, state} = this.flags

    let documents
    try {
      documents = await listDocuments(knowledgeBaseId, {
        ...(source !== undefined && {source}),
        ...(state !== undefined && {state}),
      })
    } catch (error) {
      listDocumentsDebug('Error listing documents', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to list documents: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (json) {
      this.logJson(documents)
      return
    }

    if (documents.length === 0) {
      this.log('No documents found')
      return
    }

    const table = new Table({
      columns: [
        {alignment: 'left', name: 'id', title: 'ID'},
        {alignment: 'left', name: 'title', title: 'Title'},
        {alignment: 'left', name: 'sourceType', title: 'Source type'},
        {alignment: 'left', name: 'state', title: 'State'},
        {alignment: 'left', name: 'conversion', title: 'Conversion'},
        {alignment: 'left', name: 'url', title: 'URL'},
      ],
    })

    for (const document of documents) {
      table.addRow({
        conversion: document.conversion,
        id: document.id,
        sourceType: document.sourceType,
        state: document.state,
        title: document.title,
        url: document.url ?? '-',
      })
    }

    this.log(table.render())
  }
}
