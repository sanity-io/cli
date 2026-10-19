import {Args} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {reopenIssue} from '../../../services/context.js'

const reopenIssueDebug = subdebug('context:issues:reopen')

export class ReopenIssueCommand extends SanityCommand<typeof ReopenIssueCommand> {
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

  static override description = 'Reopen a resolved conflict issue'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 issue.def456',
      description: 'Return a resolved conflict issue to triage',
    },
  ]

  public async run(): Promise<void> {
    const {issueId, knowledgeBaseId} = this.args

    let reopened
    try {
      reopened = await reopenIssue(knowledgeBaseId, issueId)
    } catch (error) {
      reopenIssueDebug('Error reopening issue', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Issue "${issueId}" not found on knowledge base "${knowledgeBaseId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to reopen issue: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    // The API returns the issue unchanged when it cannot be reopened
    if (reopened.status !== 'open') {
      const status = reopened.status === 'rejected' ? 'dismissed' : reopened.status
      this.error(
        `Issue "${issueId}" is ${status} and cannot be reopened.\nOnly resolved conflict issues can be reopened.`,
        {exit: exitCodes.RUNTIME_ERROR},
      )
    }

    this.log('Issue reopened')
  }
}
