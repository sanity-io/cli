import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {editInstruction} from '../../../services/context.js'
import {defineCommandTelemetry} from '../../../util/telemetry/commandTelemetry.js'

const editInstructionDebug = subdebug('context:instructions:edit')

const EDIT_FLAGS = ['statement', 'scope-source'] as const

const flags = {
  'scope-source': Flags.string({
    atLeastOne: [...EDIT_FLAGS],
    description: 'Source the instruction applies to, replacing the current sources (repeatable)',
    helpValue: '<id>',
    multiple: true,
    parse: async (input: string) => {
      const trimmed = input.trim()
      if (trimmed === '') {
        throw new Error('`--scope-source` cannot be empty if provided')
      }
      return trimmed
    },
  }),
  statement: Flags.string({
    atLeastOne: [...EDIT_FLAGS],
    description: 'New instruction statement',
    parse: async (input: string) => {
      const trimmed = input.trim()
      if (trimmed === '') {
        throw new Error('`--statement` cannot be empty if provided')
      }
      return trimmed
    },
  }),
} satisfies FlagInput

export class EditInstructionCommand extends SanityCommand<typeof EditInstructionCommand> {
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

  static override description = 'Edit an instruction'

  static override examples = [
    {
      command:
        '<%= config.bin %> <%= command.id %> kb-abc123 instruction.def456 --statement "Prefer the 2027 pricing page"',
      description: 'Change the statement of an instruction',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> kb-abc123 instruction.def456 --scope-source source-a --scope-source source-b',
      description: 'Apply an instruction to two other sources',
    },
  ]

  static override flags = flags

  static telemetry = defineCommandTelemetry(flags, {redact: ['statement']})

  public async run(): Promise<void> {
    const {instructionId, knowledgeBaseId} = this.args
    const {'scope-source': scopeSourceIds, statement} = this.flags

    try {
      await editInstruction(knowledgeBaseId, instructionId, {
        ...(scopeSourceIds && {scopeSourceIds}),
        ...(statement && {statement}),
      })
      this.log('Instruction updated')
    } catch (error) {
      editInstructionDebug('Error editing instruction', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(
          `Instruction "${instructionId}" not found on knowledge base "${knowledgeBaseId}"`,
          {exit: exitCodes.RUNTIME_ERROR},
        )
      }
      this.error(`Failed to edit instruction: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
