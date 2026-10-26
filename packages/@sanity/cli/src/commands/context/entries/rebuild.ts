import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {formatJobFailure, watchJob} from '../../../actions/context/watchJob.js'
import {formatKeyValue} from '../../../actions/debug/output.js'
import {rebuildEntry} from '../../../services/context.js'

const rebuildEntryDebug = subdebug('context:entries:rebuild')

export class RebuildEntryCommand extends SanityCommand<typeof RebuildEntryCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
    path: Args.string({
      description: 'Entry path, as listed by `sanity context entries list`',
      required: true,
    }),
  }

  static override description = 'Rebuild one entry from its sources'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 billing/refunds',
      description: 'Start a rebuild and return the job ID',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 billing/refunds --watch',
      description: 'Rebuild an entry and wait for it to finish (non-zero exit on failure)',
    },
  ]

  static override flags = {
    watch: Flags.boolean({
      default: false,
      description: 'Wait for the rebuild to finish, exiting non-zero if it fails',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {knowledgeBaseId, path} = this.args
    const {watch} = this.flags

    let accepted
    const spin = spinner('Starting rebuild').start()
    try {
      accepted = await rebuildEntry(knowledgeBaseId, path)
      spin.succeed('Rebuild started')
    } catch (error) {
      spin.fail()
      rebuildEntryDebug('Error starting rebuild', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Entry "${path}" not found on knowledge base "${knowledgeBaseId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to start rebuild: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    const {affectedEntries, jobId} = accepted
    const padTo = 19 // "Shares sources with" is the longest key
    this.log(formatKeyValue('Job ID', jobId, {padTo}))
    // Other entries citing the same sources can change when they are next rebuilt
    if (affectedEntries.length > 0) {
      const paths = affectedEntries.map((entry) => entry.path).join(', ')
      this.log(formatKeyValue('Shares sources with', paths, {padTo}))
    }
    this.log(`Track it with: sanity context jobs get ${knowledgeBaseId} ${jobId}`)

    if (!watch) {
      return
    }

    let job
    try {
      job = await watchJob(knowledgeBaseId, jobId, {
        label: 'Rebuilding entry',
        successText: 'Entry rebuilt',
      })
    } catch (error) {
      rebuildEntryDebug('Error watching rebuild job', error)
      this.error(`Failed to watch rebuild job: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (job.status !== 'succeeded') {
      this.error(formatJobFailure('Rebuild', job), {exit: exitCodes.RUNTIME_ERROR})
    }
  }
}
