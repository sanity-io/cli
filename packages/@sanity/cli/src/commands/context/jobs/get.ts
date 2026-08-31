import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {watchJob} from '../../../actions/context/watchJob.js'
import {getJob} from '../../../services/context.js'

const getJobDebug = subdebug('context:jobs:get')

export class GetJobCommand extends SanityCommand<typeof GetJobCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
    // eslint-disable-next-line perfectionist/sort-objects -- positional order: knowledge base first
    jobId: Args.string({
      description: 'Job ID',
      required: true,
    }),
  }

  static override description = 'Get the status of a knowledge base job'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 job-def456',
      description: 'Get the current status of a job',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 job-def456 --watch',
      description: 'Wait for the job to finish (non-zero exit if it does not succeed)',
    },
  ]

  static override flags = {
    json: Flags.boolean({
      default: false,
      description: 'Output the job in JSON format',
    }),
    watch: Flags.boolean({
      default: false,
      description: 'Poll until the job reaches a terminal state',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {jobId, knowledgeBaseId} = this.args
    const {json, watch} = this.flags

    let job
    try {
      job = watch
        ? await watchJob(knowledgeBaseId, jobId, {label: 'Waiting for job'})
        : await getJob(knowledgeBaseId, jobId)
    } catch (error) {
      getJobDebug('Error getting job', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Job "${jobId}" not found on knowledge base "${knowledgeBaseId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to get job: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (json) {
      this.log(JSON.stringify(job, null, 2))
    } else {
      this.log(`ID:        ${job.id}`)
      this.log(`Status:    ${job.status}`)
      this.log(`Started:   ${job.startedAt ?? '-'}`)
      this.log(`Completed: ${job.completedAt ?? '-'}`)
      this.log(`Error:     ${job.error ?? '-'}`)
    }

    if (watch && job.status !== 'succeeded') {
      this.error(`Job ${job.status}${job.error ? `: ${job.error}` : ''}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
