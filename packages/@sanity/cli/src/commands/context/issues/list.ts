import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {type Context, isHttpError} from '@sanity/client'

import {listIssues} from '../../../services/context.js'
import {Table} from '../../../util/responsiveTable.js'

const listIssuesDebug = subdebug('context:issues:list')

export class ListIssuesCommand extends SanityCommand<typeof ListIssuesCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
  }

  static override description = 'List issues found by knowledge base builds'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123',
      description: 'List all issues for a knowledge base',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --status open',
      description: 'List issues awaiting triage',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --json',
      description: 'Output issues as JSON',
    },
  ]

  static override flags = {
    json: Flags.boolean({
      default: false,
      description: 'Output issues in JSON format',
    }),
    status: Flags.custom<Context.IssueDoc['status']>({
      description:
        'Only list issues with this status (rejected = dismissed, accepted = resolved or applied)',
      options: ['open', 'accepted', 'rejected'],
    })(),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {knowledgeBaseId} = this.args
    const {json, status} = this.flags

    let issues
    try {
      issues = await listIssues(knowledgeBaseId, status)
    } catch (error) {
      listIssuesDebug('Error listing issues', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to list issues: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (json) {
      this.log(JSON.stringify(issues, null, 2))
      return
    }

    if (issues.length === 0) {
      this.log('No issues found')
      return
    }

    const table = new Table({
      columns: [
        {alignment: 'left', name: 'id', title: 'ID'},
        {alignment: 'left', name: 'kind', title: 'Kind'},
        {alignment: 'left', name: 'severity', title: 'Severity'},
        {alignment: 'left', name: 'status', title: 'Status'},
        {alignment: 'left', name: 'scope', title: 'Scope'},
        {alignment: 'left', name: 'createdAt', title: 'Created'},
      ],
    })

    for (const issue of issues) {
      table.addRow({
        createdAt: issue._createdAt,
        id: issue._id,
        kind: issue.content.kind,
        scope: issue.content.scopePath,
        severity: issue.content.severity,
        status: issue.status,
      })
    }

    this.log(table.render())
  }
}
