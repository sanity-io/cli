import {Args} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {formatSync, heldSyncHint} from '../../../../actions/context/syncOutput.js'
import {getSync} from '../../../../services/context.js'

const getSyncDebug = subdebug('context:sources:syncs:get')

export class GetSyncCommand extends SanityCommand<typeof GetSyncCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),

    sourceId: Args.string({
      description: 'Source ID',
      required: true,
    }),
    syncId: Args.string({
      description: 'Sync ID',
      required: true,
    }),
  }

  static override description = 'Get details of a sync'

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 source-def456 sync-ghi789',
      description: 'Get details of a sync',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 source-def456 sync-ghi789 --json',
      description: 'Output the sync as JSON',
    },
  ]

  public async run(): Promise<void> {
    const {knowledgeBaseId, sourceId, syncId} = this.args
    const {json} = this.flags

    let sync
    try {
      sync = await getSync(knowledgeBaseId, sourceId, syncId)
    } catch (error) {
      getSyncDebug('Error getting sync', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Sync "${syncId}" not found on source "${sourceId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to get sync: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (json) {
      this.logJson(sync)
      return
    }

    for (const line of formatSync(sync)) this.log(line)
    const hint = heldSyncHint(knowledgeBaseId, sync)
    if (hint) this.log(`\n${hint}`)
  }
}
