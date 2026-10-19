import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {requiredWhenUnattended} from '@sanity/cli-core/flags'
import {input} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {formatKeyValue} from '../../../actions/debug/output.js'
import {createInstruction} from '../../../services/context.js'
import {defineCommandTelemetry} from '../../../util/telemetry/commandTelemetry.js'

const createInstructionDebug = subdebug('context:instructions:create')

const flags = {
  'scope-source': Flags.string({
    description: 'Source the instruction applies to (repeatable)',
    helpValue: '<id>',
    multiple: true,
    parse: async (input: string) => {
      const trimmed = input.trim()
      if (trimmed === '') {
        throw new Error('`--scope-source` cannot be empty if provided')
      }
      return trimmed
    },
    required: true,
  }),
  statement: requiredWhenUnattended(
    Flags.string({
      description: 'What every build should follow',
    }),
  ),
} satisfies FlagInput

export class CreateInstructionCommand extends SanityCommand<typeof CreateInstructionCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
  }

  static override description = 'Create an instruction that steers every knowledge base build'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --scope-source source-def456',
      description: 'Create an instruction for one source, prompting for the statement',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> kb-abc123 --statement "Treat these as the authoritative refund policy" --scope-source source-def456 --scope-source source-ghi789',
      description: 'Create an instruction for two sources',
    },
  ]

  static override flags = flags

  static telemetry = defineCommandTelemetry(flags, {redact: ['statement']})

  public async run(): Promise<void> {
    const {knowledgeBaseId} = this.args
    const {'scope-source': scopeSourceIds, statement: statementFlag} = this.flags

    if (statementFlag !== undefined && statementFlag.trim() === '') {
      this.error('Statement cannot be empty', {exit: exitCodes.USAGE_ERROR})
    }

    const statement = statementFlag?.trim() || (await promptForStatement())

    try {
      const {instruction} = await createInstruction(knowledgeBaseId, {scopeSourceIds, statement})
      this.log('Instruction created')
      this.log(formatKeyValue('ID', instruction.id))
    } catch (error) {
      createInstructionDebug('Error creating instruction', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to create instruction: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}

async function promptForStatement(): Promise<string> {
  const value = await input({
    message: 'Instruction statement:',
    validate: (input_) => input_.trim().length > 0 || 'Value cannot be empty',
  })
  return value.trim()
}
