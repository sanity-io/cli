import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {confirm} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {deleteSource} from '../../../services/context.js'

const deleteSourceDebug = subdebug('context:sources:delete')

export class DeleteSourceCommand extends SanityCommand<typeof DeleteSourceCommand> {
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
    'Remove a source and its documents from a knowledge base, and their citations from its entries'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 source-def456',
      description: 'Delete a source after confirmation',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 source-def456 --yes',
      description: 'Delete a source without confirmation prompt',
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
    const {knowledgeBaseId, sourceId} = this.args
    const {yes: skipConfirmation} = this.flags

    if (this.isUnattended() && !skipConfirmation) {
      this.error('Deletion requires confirmation. Pass `--yes` to delete the source.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    if (!skipConfirmation) {
      const confirmed = await confirm({
        default: false,
        message: `Delete source "${sourceId}" and its documents?`,
      })

      if (!confirmed) {
        this.log('Source not deleted')
        this.exit(exitCodes.USER_ABORT)
      }
    }

    try {
      await deleteSource(knowledgeBaseId, sourceId)
      this.log('Source deleted')
    } catch (error) {
      deleteSourceDebug('Error deleting source', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Source "${sourceId}" not found on knowledge base "${knowledgeBaseId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to delete source: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
