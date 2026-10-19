import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {formatJobFailure, watchJob} from '../../../actions/context/watchJob.js'
import {formatKeyValue} from '../../../actions/debug/output.js'
import {applyIssues} from '../../../services/context.js'

const applyIssuesDebug = subdebug('context:issues:apply')

export class ApplyIssuesCommand extends SanityCommand<typeof ApplyIssuesCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
    // eslint-disable-next-line perfectionist/sort-objects -- positional order: knowledge base first
    issueId: Args.string({
      description: 'ID of an issue to accept and apply (pass several to apply them in one batch)',
      multiple: true,
      required: true,
    }),
  }

  static override description = 'Accept and apply issues to a knowledge base'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 issue.def456 issue.ghi789',
      description: 'Accept and apply two issues in one batch',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 issue.def456 --watch',
      description: 'Apply an issue and wait for it to finish (non-zero exit on failure)',
    },
  ]

  static override flags = {
    watch: Flags.boolean({
      default: false,
      description: 'Wait for the apply to finish, exiting non-zero if it fails',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {issueId: issueIds, knowledgeBaseId} = this.args
    const {watch} = this.flags

    let jobId: string
    const spin = spinner('Starting apply').start()
    try {
      const accepted = await applyIssues(knowledgeBaseId, issueIds)
      jobId = accepted.jobId
      spin.succeed('Apply started')
    } catch (error) {
      spin.fail()
      applyIssuesDebug('Error applying issues', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to apply issues: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    this.log(formatKeyValue('Job ID', jobId))
    this.log(`Track it with: sanity context jobs get ${knowledgeBaseId} ${jobId}`)

    if (!watch) {
      return
    }

    let job
    try {
      job = await watchJob(knowledgeBaseId, jobId, {
        label: 'Applying issues',
        successText: 'Issues applied',
      })
    } catch (error) {
      applyIssuesDebug('Error watching apply job', error)
      this.error(`Failed to watch apply job: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (job.status !== 'succeeded') {
      this.error(formatJobFailure('Apply', job), {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
