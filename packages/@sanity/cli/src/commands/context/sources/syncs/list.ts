import {Args} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {listSyncs} from '../../../../services/context.js'
import {Table} from '../../../../util/responsiveTable.js'

const listSyncsDebug = subdebug('context:sources:syncs:list')

export class ListSyncsCommand extends SanityCommand<typeof ListSyncsCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),

    sourceId: Args.string({
      description: 'Source ID',
      required: true,
    }),
  }

  static override description = 'List the syncs of a source, newest first'

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 source-def456',
      description: 'List the syncs of a source',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 source-def456 --json',
      description: 'Output syncs as JSON',
    },
  ]

  public async run(): Promise<void> {
    const {knowledgeBaseId, sourceId} = this.args
    const {json} = this.flags

    let syncs
    try {
      syncs = await listSyncs(knowledgeBaseId, sourceId)
    } catch (error) {
      listSyncsDebug('Error listing syncs', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Source "${sourceId}" not found on knowledge base "${knowledgeBaseId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to list syncs: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (json) {
      this.logJson(syncs)
      return
    }

    if (syncs.length === 0) {
      this.log('No syncs found')
      return
    }

    const table = new Table({
      columns: [
        {alignment: 'left', name: 'id', title: 'ID'},
        {alignment: 'left', name: 'status', title: 'Status'},
        {alignment: 'left', name: 'trigger', title: 'Trigger'},
        {alignment: 'right', name: 'seen', title: 'Seen'},
        {alignment: 'right', name: 'upserted', title: 'Upserted'},
        {alignment: 'right', name: 'deleted', title: 'Deleted'},
        {alignment: 'right', name: 'held', title: 'Held'},
        {alignment: 'left', name: 'createdAt', title: 'Created'},
      ],
    })

    for (const sync of syncs) {
      table.addRow({
        createdAt: sync.createdAt,
        deleted: sync.documentsDeleted,
        held: sync.heldDeletions ?? '-',
        id: sync.id,
        seen: sync.documentsSeen,
        status: sync.status,
        trigger: sync.trigger,
        upserted: sync.documentsUpserted,
      })
    }

    this.log(table.render())
  }
}
