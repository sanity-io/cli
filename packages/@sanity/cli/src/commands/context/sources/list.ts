import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {type Context, isHttpError} from '@sanity/client'

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

  static override description = 'List sources for a knowledge base'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123',
      description: 'List all sources for a knowledge base',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --status failed',
      description: 'List sources that failed processing',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --import import-def456 --json',
      description: 'Output the sources from one import as JSON',
    },
  ]

  static override flags = {
    import: Flags.string({
      description: 'Only list sources from this import',
      helpValue: '<id>',
      parse: async (input: string) => {
        const trimmed = input.trim()
        if (trimmed === '') {
          throw new Error('`--import` cannot be empty if provided')
        }
        return trimmed
      },
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output sources in JSON format',
    }),
    status: Flags.custom<Context.Source['status']>({
      description: 'Only list sources with this status',
      options: ['pending', 'processing', 'ready', 'failed', 'skipped'],
    })(),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {knowledgeBaseId} = this.args
    const {import: importId, json, status} = this.flags

    let sources
    try {
      sources = await listSources(knowledgeBaseId, {importId, status})
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
      this.log(JSON.stringify(sources, null, 2))
      return
    }

    if (sources.length === 0) {
      this.log('No sources found')
      return
    }

    const table = new Table({
      columns: [
        {alignment: 'left', name: 'id', title: 'ID'},
        {alignment: 'left', name: 'filename', title: 'Filename'},
        {alignment: 'left', name: 'kind', title: 'Kind'},
        {alignment: 'left', name: 'status', title: 'Status'},
        {alignment: 'left', name: 'createdAt', title: 'Created'},
      ],
    })

    for (const {createdAt, filename, id, kind, status: sourceStatus} of sources) {
      table.addRow({createdAt, filename, id, kind, status: sourceStatus})
    }

    this.log(table.render())
  }
}
