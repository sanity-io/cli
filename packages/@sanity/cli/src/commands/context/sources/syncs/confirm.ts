import {Args} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {formatKeyValue} from '../../../../actions/debug/output.js'
import {confirmSync} from '../../../../services/context.js'

const confirmSyncDebug = subdebug('context:sources:syncs:confirm')

export class ConfirmSyncCommand extends SanityCommand<typeof ConfirmSyncCommand> {
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

  static override description =
    "Confirm a held sync: delete the documents it didn't find, and complete it"

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 source-def456 sync-ghi789',
      description: 'Delete the documents a held sync did not find',
    },
  ]

  public async run(): Promise<void> {
    const {knowledgeBaseId, sourceId, syncId} = this.args

    const spin = spinner('Confirming sync').start()
    try {
      const sync = await confirmSync(knowledgeBaseId, sourceId, syncId)
      spin.succeed('Sync confirmed')
      this.log(formatKeyValue('Status', sync.status))
    } catch (error) {
      spin.fail()
      confirmSyncDebug('Error confirming sync', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Sync "${syncId}" not found on source "${sourceId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to confirm sync: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
