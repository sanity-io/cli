import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage, JsonOutputError} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {type Context, isHttpError} from '@sanity/client'

import {formatSync, heldSyncHint} from '../../../actions/context/syncOutput.js'
import {formatSyncFailure, watchSourceSync} from '../../../actions/context/watchSourceSync.js'
import {formatKeyValue} from '../../../actions/debug/output.js'
import {getSource, syncSource} from '../../../services/context.js'

const syncSourceDebug = subdebug('context:sources:sync')

export class SyncSourceCommand extends SanityCommand<typeof SyncSourceCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),

    sourceId: Args.string({
      description: 'Source ID',
      required: true,
    }),
  }

  static override description =
    'Sync a source: read its website or dataset again, or sync the file a files source holds'

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 source-def456',
      description: 'Start a sync; a website or dataset sync waits for any running sync of it',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 source-def456 --watch',
      description: 'Wait for the sync to finish (non-zero exit if it fails)',
    },
  ]

  static override flags = {
    watch: Flags.boolean({
      default: false,
      description: 'Wait for the sync to finish, exiting non-zero if it fails',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {knowledgeBaseId, sourceId} = this.args
    const {json, watch} = this.flags

    const spin = spinner('Starting sync').start()
    let accepted: Context.SyncAccepted
    let previousSyncId: string | null = null
    try {
      if (watch) {
        previousSyncId = (await getSource(knowledgeBaseId, sourceId)).latestSync?.id ?? null
      }
      accepted = await syncSource(knowledgeBaseId, sourceId)
      spin.succeed(accepted.jobId ? 'Sync started' : 'Sync requested')
    } catch (error) {
      spin.fail()
      syncSourceDebug('Error starting sync', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Source "${sourceId}" not found on knowledge base "${knowledgeBaseId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to start sync: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (!watch) {
      if (json) {
        this.logJson(accepted)
        return
      }
      if (accepted.jobId) this.log(formatKeyValue('Job ID', accepted.jobId))
      this.log(`Track it with: sanity context sources get ${knowledgeBaseId} ${sourceId}`)
      return
    }

    let sync: Context.Sync
    try {
      sync = await watchSourceSync(knowledgeBaseId, sourceId, previousSyncId)
    } catch (error) {
      syncSourceDebug('Error watching sync', error)
      this.error(`Failed to watch sync: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    const syncFailed = sync.status === 'failed' || sync.status === 'cancelled'
    if (json) {
      if (syncFailed) {
        throw new JsonOutputError(formatSyncFailure(sync), sync, exitCodes.RUNTIME_ERROR)
      }
      this.logJson(sync)
      return
    }

    for (const line of formatSync(sync)) this.log(line)
    const hint = heldSyncHint(knowledgeBaseId, sync)
    if (hint) this.log(`\n${hint}`)

    if (syncFailed) {
      this.error(formatSyncFailure(sync), {exit: exitCodes.RUNTIME_ERROR})
    }
  }
}
