import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {waitForJob} from '../../actions/context/waitForJob.js'
import {buildKnowledgeBase, cancelKnowledgeBaseBuild} from '../../services/context.js'

const buildContextDebug = subdebug('context:build')

export class BuildKnowledgeBaseCommand extends SanityCommand<typeof BuildKnowledgeBaseCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
  }

  static override description = 'Build a knowledge base from its imported content'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123',
      description: 'Start a build and return the job ID',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --watch',
      description: 'Start a build and wait for it to finish (non-zero exit on failure)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --cancel',
      description: 'Cancel the running build, if any',
    },
  ]

  static override flags = {
    cancel: Flags.boolean({
      default: false,
      description: 'Cancel the running build instead of starting one',
      exclusive: ['watch'],
    }),
    watch: Flags.boolean({
      default: false,
      description: 'Wait for the build to finish, exiting non-zero if it fails',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {knowledgeBaseId} = this.args
    const {cancel, watch} = this.flags

    if (cancel) {
      await this.cancelBuild(knowledgeBaseId)
      return
    }

    let jobId: string
    const spin = spinner('Starting build').start()
    try {
      const accepted = await buildKnowledgeBase(knowledgeBaseId)
      jobId = accepted.jobId
      spin.succeed('Build started')
    } catch (error) {
      spin.fail()
      buildContextDebug('Error starting build', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to start build: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (!watch) {
      this.log(`Job ID: ${jobId}`)
      this.log(`Track it with: sanity context jobs get ${knowledgeBaseId} ${jobId}`)
      return
    }

    const watchSpin = spinner('Building knowledge base').start()
    let job
    try {
      job = await waitForJob(knowledgeBaseId, jobId, {
        onPoll: (pending) => {
          watchSpin.text = `Building knowledge base (${pending.status})`
        },
      })
    } catch (error) {
      watchSpin.fail()
      buildContextDebug('Error watching build job', error)
      this.error(`Failed to watch build job: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (job.status !== 'succeeded') {
      watchSpin.fail()
      this.error(`Build ${job.status}${job.error ? `: ${job.error}` : ''}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    watchSpin.succeed('Build succeeded')
  }

  private async cancelBuild(knowledgeBaseId: string): Promise<void> {
    try {
      const {cancelled} = await cancelKnowledgeBaseBuild(knowledgeBaseId)
      this.log(cancelled ? 'Build cancelled' : 'No running build to cancel')
    } catch (error) {
      buildContextDebug('Error cancelling build', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to cancel build: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
