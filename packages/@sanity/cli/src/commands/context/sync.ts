import {Args} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {type Context, isHttpError} from '@sanity/client'

import {syncKnowledgeBase} from '../../services/context.js'
import {pluralize} from '../../util/pluralize.js'

const syncContextDebug = subdebug('context:sync')

export class SyncKnowledgeBaseCommand extends SanityCommand<typeof SyncKnowledgeBaseCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
  }

  static override description =
    'Sync every website and dataset source of a knowledge base; files sources sync when you upload a file'

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123',
      description: 'Queue a sync of every website and dataset source',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --json',
      description: 'Output the IDs of the sources queued to sync as JSON',
    },
  ]

  public async run(): Promise<void> {
    const {knowledgeBaseId} = this.args
    const {json} = this.flags

    const spin = spinner('Queueing syncs').start()
    let accepted: Context.SyncAllAccepted
    try {
      accepted = await syncKnowledgeBase(knowledgeBaseId)
      spin.succeed()
    } catch (error) {
      spin.fail()
      syncContextDebug('Error syncing knowledge base', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to sync knowledge base: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (json) {
      this.logJson(accepted)
      return
    }

    const {sourceIds} = accepted
    if (sourceIds.length === 0) {
      this.log('No website or dataset sources to sync')
      return
    }

    this.log(`Queued a sync of ${sourceIds.length} ${pluralize('source', sourceIds.length)}:`)
    for (const sourceId of sourceIds) this.log(`  ${sourceId}`)
    this.log(`Check progress with: sanity context sources list ${knowledgeBaseId}`)
  }
}
