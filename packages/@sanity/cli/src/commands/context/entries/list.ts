import {Args} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {listEntries} from '../../../services/context.js'
import {Table} from '../../../util/responsiveTable.js'

const listEntriesDebug = subdebug('context:entries:list')

export class ListEntriesCommand extends SanityCommand<typeof ListEntriesCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
  }

  static override description = 'List the entries a knowledge base build produced'

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123',
      description: 'List all entries for a knowledge base',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --json',
      description: 'Output entries as JSON',
    },
  ]

  public async run(): Promise<void> {
    const {knowledgeBaseId} = this.args
    const {json} = this.flags

    let entries
    try {
      entries = await listEntries(knowledgeBaseId)
    } catch (error) {
      listEntriesDebug('Error listing entries', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to list entries: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (json) {
      this.logJson(entries)
      return
    }

    if (entries.length === 0) {
      this.log('No entries found')
      return
    }

    const table = new Table({
      columns: [
        {alignment: 'left', name: 'path', title: 'Path'},
        {alignment: 'left', name: 'title', title: 'Title'},
        {alignment: 'left', name: 'status', title: 'Status'},
      ],
    })

    for (const {path, status, title} of entries) {
      table.addRow({path, status, title})
    }

    this.log(table.render())
  }
}
