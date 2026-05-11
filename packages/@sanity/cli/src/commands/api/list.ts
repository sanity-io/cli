import {Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import open from 'open'

import {buildOperationsIndex, loadParsedSpecs} from '../../api/parser.js'
import {revalidateSpecs} from '../../api/revalidate.js'
import {printOperationsTable, toOperationJsonRow} from '../../api/views.js'

const debug = subdebug('api:list')

const HTTP_REFERENCE_URL = 'https://www.sanity.io/docs/http-reference'

export class ApiListCommand extends SanityCommand<typeof ApiListCommand> {
  static override description = 'List all OpenAPI operations across the public Sanity HTTP specs'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Render a table of operations across every spec',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --json',
      description: 'Emit JSON (one row per operation) — agent-friendly',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --spec=jobs',
      description: 'Narrow to a single spec',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --web',
      description: 'Open the HTTP Reference index in a browser',
    },
  ]

  static override flags = {
    json: Flags.boolean({description: 'Emit JSON: one entry per operation'}),
    spec: Flags.string({description: 'Narrow to a single spec (by slug)'}),
    web: Flags.boolean({char: 'w', description: 'Open the HTTP Reference in browser'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(ApiListCommand)

    if (flags.web) {
      this.log(`Opening ${HTTP_REFERENCE_URL}`)
      await open(HTTP_REFERENCE_URL)
      return
    }

    const operations = await this.loadOperations(flags.spec)

    if (flags.json) {
      this.log(
        JSON.stringify(
          operations.map((op) => toOperationJsonRow(op)),
          null,
          2,
        ),
      )
      return
    }

    if (operations.length === 0) {
      this.log(
        flags.spec
          ? `No operations found for spec "${flags.spec}". Run \`sanity api list\` to see available specs.`
          : 'No OpenAPI specifications available. The docs service may be unreachable — try again later.',
      )
      return
    }

    printOperationsTable(operations)
  }

  private async loadOperations(specFilter: string | undefined) {
    try {
      const {index} = await revalidateSpecs()
      const parsedSpecs = await loadParsedSpecs(index)
      const operations = buildOperationsIndex(parsedSpecs)
      return specFilter ? operations.filter((op) => op.spec === specFilter) : operations
    } catch (error) {
      debug('list failed', error)
      this.error('The OpenAPI service is currently unavailable. Try again later.', {exit: 1})
    }
  }
}
