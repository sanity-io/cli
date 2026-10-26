import {Args} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {formatKeyValue} from '../../../actions/debug/output.js'
import {getIssue} from '../../../services/context.js'

const getIssueDebug = subdebug('context:issues:get')

export class GetIssueCommand extends SanityCommand<typeof GetIssueCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
    // eslint-disable-next-line perfectionist/sort-objects -- positional order: knowledge base first
    issueId: Args.string({
      description: 'Issue ID',
      required: true,
    }),
  }

  static override description = 'Get details of an issue'

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 issue.def456',
      description: 'Get details of a specific issue',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 issue.def456 --json',
      description: 'Output the issue as JSON',
    },
  ]

  public async run(): Promise<void> {
    const {issueId, knowledgeBaseId} = this.args
    const {json} = this.flags

    let issue
    try {
      issue = await getIssue(knowledgeBaseId, issueId)
    } catch (error) {
      getIssueDebug('Error getting issue', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to get issue: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (!issue) {
      this.error(`Issue "${issueId}" not found on knowledge base "${knowledgeBaseId}"`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (json) {
      this.logJson(issue)
      return
    }

    const {content} = issue
    const padTo = 13 // "Suggested fix" is the longest key
    this.log(formatKeyValue('ID', issue._id, {padTo}))
    this.log(formatKeyValue('Kind', content.kind, {padTo}))
    this.log(formatKeyValue('Severity', content.severity, {padTo}))
    this.log(formatKeyValue('Status', issue.status, {padTo}))
    this.log(formatKeyValue('Scope', content.scopePath, {padTo}))
    this.log(formatKeyValue('Issue', content.issue, {padTo}))
    this.log(formatKeyValue('Suggested fix', content.suggestedFix, {padTo}))
    // Sides are labeled with the 0-based index that `issues resolve --side` takes
    if (content.kind === 'conflict') {
      for (const [index, side] of content.sides.entries()) {
        const entryPaths = side.entryPaths?.length ? ` (${side.entryPaths.join(', ')})` : ''
        this.log(formatKeyValue(`Side [${index}]`, `${side.claim}${entryPaths}`, {padTo}))
      }
      if (content.suggested !== undefined) {
        this.log(formatKeyValue('Suggested', `[${content.suggested}]`, {padTo}))
      }
    }
    this.log(
      formatKeyValue('Resolution', issue.resolution === null ? '-' : `[${issue.resolution}]`, {
        padTo,
      }),
    )
    this.log(formatKeyValue('Created', issue._createdAt, {padTo}))
  }
}
