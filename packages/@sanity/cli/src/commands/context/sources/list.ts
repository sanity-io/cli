import {Args} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {listSources} from '../../../services/context.js'
import {Table} from '../../../util/responsiveTable.js'

const listSourcesDebug = subdebug('context:sources:list')

export class ListSourcesCommand extends SanityCommand<typeof ListSourcesCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
  }

  static override description = 'List the websites, datasets and files a knowledge base reads'

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123',
      description: 'List the sources of a knowledge base',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --json',
      description: 'Output sources as JSON',
    },
  ]

  public async run(): Promise<void> {
    const {knowledgeBaseId} = this.args
    const {json} = this.flags

    let sources
    try {
      sources = await listSources(knowledgeBaseId)
    } catch (error) {
      listSourcesDebug('Error listing sources', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to list sources: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (json) {
      this.logJson(sources)
      return
    }

    if (sources.length === 0) {
      this.log('No sources found')
      return
    }

    const table = new Table({
      columns: [
        {alignment: 'left', name: 'id', title: 'ID'},
        {alignment: 'left', name: 'title', title: 'Title'},
        {alignment: 'left', name: 'type', title: 'Type'},
        {alignment: 'right', name: 'documents', title: 'Documents'},
        {alignment: 'left', name: 'sync', title: 'Latest sync'},
        {alignment: 'left', name: 'lastSyncedAt', title: 'Last synced'},
      ],
    })

    for (const source of sources) {
      table.addRow({
        documents: source.documentCount,
        id: source.id,
        lastSyncedAt: source.lastSyncedAt ?? '-',
        sync: source.latestSync?.status ?? '-',
        title: source.title,
        type: source.type,
      })
    }

    this.log(table.render())
  }
}
