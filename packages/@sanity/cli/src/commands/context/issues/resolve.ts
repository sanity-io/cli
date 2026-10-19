import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {requiredWhenUnattended} from '@sanity/cli-core/flags'
import {select} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {formatJobFailure, watchJob} from '../../../actions/context/watchJob.js'
import {formatKeyValue} from '../../../actions/debug/output.js'
import {getIssue, resolveIssue} from '../../../services/context.js'

const resolveIssueDebug = subdebug('context:issues:resolve')

export class ResolveIssueCommand extends SanityCommand<typeof ResolveIssueCommand> {
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

  static override description = 'Resolve a conflict issue by choosing the correct side'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 issue.def456',
      description: 'Interactively choose the correct side of a conflict',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 issue.def456 --side 1 --watch',
      description: 'Choose side 1 and wait for the entry to be rewritten',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 issue.def456 --side 0',
      description: 'Keep the entry as it is (for a conflict on a single entry)',
    },
  ]

  static override flags = {
    side: requiredWhenUnattended(
      Flags.integer({
        description: 'Index of the correct side, as listed by `sanity context issues get`',
        min: 0,
      }),
    ),
    watch: Flags.boolean({
      default: false,
      description: 'Wait for the entry rewrite to finish, exiting non-zero if it fails',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {issueId, knowledgeBaseId} = this.args
    const {side: sideFlag, watch} = this.flags

    const side = sideFlag ?? (await this.promptForSide(knowledgeBaseId, issueId))

    let resolved
    try {
      resolved = await resolveIssue(knowledgeBaseId, issueId, side)
    } catch (error) {
      resolveIssueDebug('Error resolving issue', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Issue "${issueId}" not found on knowledge base "${knowledgeBaseId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to resolve issue: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    this.log('Issue resolved')

    const {jobId} = resolved
    if (jobId === null) {
      return
    }

    this.log(formatKeyValue('Job ID', jobId))
    this.log(`Track it with: sanity context jobs get ${knowledgeBaseId} ${jobId}`)

    if (!watch) {
      return
    }

    let job
    try {
      job = await watchJob(knowledgeBaseId, jobId, {
        label: 'Rewriting entry',
        successText: 'Entry rewritten',
      })
    } catch (error) {
      resolveIssueDebug('Error watching rewrite job', error)
      this.error(`Failed to watch rewrite job: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (job.status !== 'succeeded') {
      this.error(formatJobFailure('Rewrite', job), {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }

  private async promptForSide(knowledgeBaseId: string, issueId: string): Promise<number> {
    let issue
    try {
      issue = await getIssue(knowledgeBaseId, issueId)
    } catch (error) {
      resolveIssueDebug('Error getting issue', error)
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

    if (issue.status === 'rejected') {
      this.error(`Issue "${issueId}" is dismissed and cannot be resolved`, {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    const {content} = issue
    if (content.kind !== 'conflict') {
      this.error(`Only conflict issues can be resolved, "${issueId}" is a ${content.kind} issue`, {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    return select({
      choices: content.sides.map((side, index) => ({
        name: `[${index}] ${side.claim}`,
        value: index,
      })),
      default: content.suggested,
      message: 'Which side is correct?',
    })
  }
}
