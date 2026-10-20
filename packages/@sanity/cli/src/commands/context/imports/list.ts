import {Args} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {type Context, isHttpError} from '@sanity/client'

import {listImports} from '../../../services/context.js'
import {Table} from '../../../util/responsiveTable.js'

const listImportsDebug = subdebug('context:imports:list')

export class ListImportsCommand extends SanityCommand<typeof ListImportsCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
  }

  static override description = 'List imports for a knowledge base'

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123',
      description: 'List all imports for a knowledge base',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --json',
      description: 'Output imports as JSON',
    },
  ]

  public async run(): Promise<{imports: Context.Import[]}> {
    const {knowledgeBaseId} = this.args

    let imports
    try {
      imports = await listImports(knowledgeBaseId)
    } catch (error) {
      listImportsDebug('Error listing imports', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to list imports: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (imports.length === 0) {
      this.log('No imports found')
      return {imports}
    }

    const table = new Table({
      columns: [
        {alignment: 'left', name: 'id', title: 'ID'},
        {alignment: 'left', name: 'name', title: 'Name'},
        {alignment: 'left', name: 'kind', title: 'Kind'},
        {alignment: 'left', name: 'status', title: 'Status'},
        {alignment: 'right', name: 'sources', title: 'Sources'},
        {alignment: 'left', name: 'createdAt', title: 'Created'},
      ],
    })

    for (const {createdAt, id, name, sourceCount, sourceKind, status} of imports) {
      table.addRow({
        createdAt,
        id,
        kind: sourceKind,
        name: name ?? '-',
        sources: sourceCount,
        status,
      })
    }

    this.log(table.render())
    return {imports}
  }
}
