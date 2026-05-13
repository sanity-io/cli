import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'
import open from 'open'

import {HTTP_REFERENCE_URL} from '../../api/docsClient.js'
import {loadOperationsIndexOrThrow, type OperationIndexEntry} from '../../api/parser.js'
import {printOperationsTable, toOperationJsonRow} from '../../api/views.js'

const CAPABILITIES = ['read', 'write', 'destructive'] as const
const METHODS = ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

export class ApiListCommand extends SanityCommand<typeof ApiListCommand> {
  static override description = 'List every operation in the Sanity HTTP API'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Show a table of operations across every spec',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --json',
      description: 'Emit JSON: one row per operation',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --spec=jobs',
      description: 'Narrow to a single spec',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --capability=destructive',
      description: 'Filter to one capability bucket (read / write / destructive)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --method=POST --grep=mutate',
      description: 'Filter by HTTP method and a case-insensitive substring',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --web',
      description: 'Open the HTTP Reference index in a browser',
    },
  ]

  static override flags = {
    capability: Flags.string({
      description: 'Filter by capability (read / write / destructive)',
      options: [...CAPABILITIES],
    }),
    grep: Flags.string({
      description: 'Case-insensitive substring match against endpoint, operationId, and summary',
    }),
    json: Flags.boolean({description: 'Emit JSON: one row per operation'}),
    method: Flags.string({
      description: 'Filter by HTTP method (case-insensitive)',
      options: [...METHODS],
    }),
    'operation-ids': Flags.boolean({
      description:
        'Include the OPERATION column. Off by default — synthesized ids can be long; --json always carries them.',
    }),
    spec: Flags.string({description: 'Narrow to a single spec (by slug)'}),
    web: Flags.boolean({
      char: 'w',
      description: 'Open the HTTP Reference in browser',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(ApiListCommand)

    if (flags.web) {
      this.log(`Opening ${HTTP_REFERENCE_URL}`)
      await open(HTTP_REFERENCE_URL)
      return
    }

    const all = await loadOperationsIndexOrThrow({onlySlug: flags.spec})
    const operations = applyFilters(all, {
      capability: flags.capability,
      grep: flags.grep,
      method: flags.method,
    })

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
      this.log(formatEmptyMessage(flags))
      return
    }

    printOperationsTable(operations, {showOperationIds: flags['operation-ids']})
  }
}

interface FilterOptions {
  capability?: string
  grep?: string
  method?: string
}

function applyFilters(
  operations: OperationIndexEntry[],
  filters: FilterOptions,
): OperationIndexEntry[] {
  const method = filters.method?.toUpperCase()
  const grep = filters.grep?.toLowerCase()
  return operations.filter((op) => {
    if (filters.capability && op.capability !== filters.capability) return false
    if (method && op.method !== method) return false
    if (grep) {
      const haystack = `${op.endpoint} ${op.operationId} ${op.summary}`.toLowerCase()
      if (!haystack.includes(grep)) return false
    }
    return true
  })
}

function formatEmptyMessage(flags: {
  capability?: string
  grep?: string
  method?: string
  spec?: string
}): string {
  const active = [
    flags.spec && `spec="${flags.spec}"`,
    flags.method && `method=${flags.method.toUpperCase()}`,
    flags.capability && `capability=${flags.capability}`,
    flags.grep && `grep="${flags.grep}"`,
  ].filter(Boolean)
  if (active.length === 0) {
    return 'No OpenAPI specifications available. The docs service may be unreachable — try again later.'
  }
  return `No operations match ${active.join(', ')}. Run \`sanity api list\` to see all operations.`
}
