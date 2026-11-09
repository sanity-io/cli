import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {type Context, isHttpError} from '@sanity/client'

import {listIssues} from '../../../services/context.js'

const listIssuesDebug = subdebug('context:issues:list')

export class ListIssuesCommand extends SanityCommand<typeof ListIssuesCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
  }

  static override description = 'List issues found by knowledge base builds'

  static override enableJsonFlag = true

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
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --kind conflict --severity critical',
      description: 'List critical conflicts',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --scope billing',
      description: 'List issues about entries under billing/',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --json',
      description: 'Output issues as JSON',
    },
  ]

  static override flags = {
    kind: Flags.custom<IssueKind>({
      description: 'Only list issues of this kind',
      // A Record forces every kind the client knows to be listed, so the options can't drift
      options: Object.keys({
        conflict: true,
        update_required: true,
      } satisfies Record<IssueKind, true>),
    })(),
    scope: Flags.string({
      description:
        'Only list issues about this entry path or anything under it (`*` for knowledge-base-wide issues)',
      helpValue: '<path>',
      parse: async (input: string) => {
        const trimmed = input.trim().replace(/\/+$/, '')
        if (trimmed === '') {
          throw new Error('`--scope` cannot be empty if provided')
        }
        return trimmed
      },
    }),
    severity: Flags.custom<Context.IssueDoc['content']['severity']>({
      description: 'Only list issues of this severity',
      options: ['critical', 'suggestion'],
    })(),
    status: Flags.custom<Context.IssueDoc['status']>({
      description:
        'Only list issues with this status (rejected = dismissed, accepted = resolved or applied)',
      options: ['open', 'accepted', 'rejected'],
    })(),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {knowledgeBaseId} = this.args
    const {json, kind, scope, severity, status} = this.flags

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

    // The client only filters on status; the rest are applied here
    const matches = issues.filter(
      ({content}) =>
        (kind === undefined || content.kind === kind) &&
        (severity === undefined || content.severity === severity) &&
        (scope === undefined ||
          content.scopePath === scope ||
          content.scopePath.startsWith(`${scope}/`)),
    )

    if (json) {
      this.logJson(matches)
      return
    }

    if (matches.length === 0) {
      this.log('No issues found')
      return
    }

    // Two lines per issue so long IDs never wrap: ID and metadata, then the summary cut to fit
    const width = Math.max(process.stdout.columns ?? 100, 40)
    const blocks = matches.map(({_id, content, status: issueStatus}) => {
      const meta = [content.kind, content.severity, issueStatus, content.scopePath].join(' · ')
      return `${_id}  ${meta}\n  ${truncate(content.issue, width - 2)}`
    })
    this.log(blocks.join('\n\n'))
  }
}

type IssueKind = Context.IssueDoc['content']['kind']

function truncate(text: string, maxLength: number): string {
  // Count characters, not UTF-16 units, so an emoji at the cut point isn't split
  const chars = [...text.replaceAll(/\s+/g, ' ').trim()]
  return chars.length <= maxLength ? chars.join('') : `${chars.slice(0, maxLength - 1).join('')}…`
}
