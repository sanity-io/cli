import {Args} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {dismissIssue} from '../../../services/context.js'

const dismissIssueDebug = subdebug('context:issues:dismiss')

export class DismissIssueCommand extends SanityCommand<typeof DismissIssueCommand> {
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

  static override description = 'Dismiss an issue'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 issue.def456',
      description: 'Dismiss an issue',
    },
  ]

  public async run(): Promise<void> {
    const {issueId, knowledgeBaseId} = this.args

    let dismissed
    try {
      dismissed = await dismissIssue(knowledgeBaseId, issueId)
    } catch (error) {
      dismissIssueDebug('Error dismissing issue', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Issue "${issueId}" not found on knowledge base "${knowledgeBaseId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to dismiss issue: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    // The API returns the issue unchanged when it already left triage
    if (dismissed.status !== 'rejected') {
      this.error(`Issue "${issueId}" is ${dismissed.status} and cannot be dismissed`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    this.log('Issue dismissed')
  }
}
