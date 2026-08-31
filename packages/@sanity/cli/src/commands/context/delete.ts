import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {confirm} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {deleteKnowledgeBase} from '../../services/context.js'

const deleteContextDebug = subdebug('context:delete')

export class DeleteKnowledgeBaseCommand extends SanityCommand<typeof DeleteKnowledgeBaseCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
  }

  static override description = 'Delete a knowledge base and its generated content'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123',
      description: 'Delete a knowledge base after confirmation',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --yes',
      description: 'Delete a knowledge base without confirmation prompt',
    },
  ]

  static override flags = {
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description: 'Skip confirmation prompt (unattended mode)',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {knowledgeBaseId} = this.args
    const {yes: skipConfirmation} = this.flags

    if (this.isUnattended() && !skipConfirmation) {
      this.error('Deletion requires confirmation. Pass `--yes` to delete the knowledge base.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    if (!skipConfirmation) {
      const confirmed = await confirm({
        default: false,
        message: `Delete knowledge base "${knowledgeBaseId}"? This permanently deletes its generated content.`,
      })

      if (!confirmed) {
        this.log('Knowledge base not deleted')
        this.exit(exitCodes.USER_ABORT)
      }
    }

    try {
      await deleteKnowledgeBase(knowledgeBaseId)
      this.log('Knowledge base deleted')
    } catch (error) {
      deleteContextDebug('Error deleting knowledge base', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to delete knowledge base: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
