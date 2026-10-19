import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {confirm} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {deleteInstruction} from '../../../services/context.js'

const deleteInstructionDebug = subdebug('context:instructions:delete')

export class DeleteInstructionCommand extends SanityCommand<typeof DeleteInstructionCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
    // eslint-disable-next-line perfectionist/sort-objects -- positional order: knowledge base first
    instructionId: Args.string({
      description: 'Instruction ID',
      required: true,
    }),
  }

  static override description = 'Delete an instruction from a knowledge base'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 instruction.def456',
      description: 'Delete an instruction after confirmation',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 instruction.def456 --yes',
      description: 'Delete an instruction without confirmation prompt',
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
    const {instructionId, knowledgeBaseId} = this.args
    const {yes: skipConfirmation} = this.flags

    if (this.isUnattended() && !skipConfirmation) {
      this.error('Deletion requires confirmation. Pass `--yes` to delete the instruction.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    if (!skipConfirmation) {
      const confirmed = await confirm({
        default: false,
        message: `Delete instruction "${instructionId}"?`,
      })

      if (!confirmed) {
        this.log('Instruction not deleted')
        this.exit(exitCodes.USER_ABORT)
      }
    }

    try {
      await deleteInstruction(knowledgeBaseId, instructionId)
      this.log('Instruction deleted')
    } catch (error) {
      deleteInstructionDebug('Error deleting instruction', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(
          `Instruction "${instructionId}" not found on knowledge base "${knowledgeBaseId}"`,
          {
            exit: exitCodes.RUNTIME_ERROR,
          },
        )
      }
      this.error(`Failed to delete instruction: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
