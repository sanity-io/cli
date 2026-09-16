import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {confirm} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {deleteImport} from '../../../services/context.js'

const deleteImportDebug = subdebug('context:imports:delete')

export class DeleteImportCommand extends SanityCommand<typeof DeleteImportCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
    // eslint-disable-next-line perfectionist/sort-objects -- positional order: knowledge base first
    importId: Args.string({
      description: 'Import ID',
      required: true,
    }),
  }

  static override description = 'Delete an import from a knowledge base'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 import-def456',
      description: 'Delete an import after confirmation',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 import-def456 --yes',
      description: 'Delete an import without confirmation prompt',
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
    const {importId, knowledgeBaseId} = this.args
    const {yes: skipConfirmation} = this.flags

    if (this.isUnattended() && !skipConfirmation) {
      this.error('Deletion requires confirmation. Pass `--yes` to delete the import.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    if (!skipConfirmation) {
      const confirmed = await confirm({
        default: false,
        message: `Delete import "${importId}"?`,
      })

      if (!confirmed) {
        this.log('Import not deleted')
        this.exit(exitCodes.USER_ABORT)
      }
    }

    try {
      await deleteImport(knowledgeBaseId, importId)
      this.log('Import deleted')
    } catch (error) {
      deleteImportDebug('Error deleting import', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Import "${importId}" not found on knowledge base "${knowledgeBaseId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to delete import: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
