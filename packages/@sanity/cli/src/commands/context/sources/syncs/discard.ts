import {Args} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {formatKeyValue} from '../../../../actions/debug/output.js'
import {discardSync} from '../../../../services/context.js'

const discardSyncDebug = subdebug('context:sources:syncs:discard')

export class DiscardSyncCommand extends SanityCommand<typeof DiscardSyncCommand> {
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
      description: 'ID of a held sync',
      required: true,
    }),
  }

  static override description = 'Discard a held sync: complete it without deleting anything'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 source-def456 sync-ghi789',
      description: 'Keep the documents a held sync did not find',
    },
  ]

  public async run(): Promise<void> {
    const {knowledgeBaseId, sourceId, syncId} = this.args

    const spin = spinner('Discarding sync').start()
    try {
      const sync = await discardSync(knowledgeBaseId, sourceId, syncId)
      spin.succeed('Sync discarded')
      this.log(formatKeyValue('Status', sync.status))
    } catch (error) {
      spin.fail()
      discardSyncDebug('Error discarding sync', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Sync "${syncId}" not found on source "${sourceId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to discard sync: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
