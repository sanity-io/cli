import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {listInstructions} from '../../../services/context.js'
import {Table} from '../../../util/responsiveTable.js'

const listInstructionsDebug = subdebug('context:instructions:list')

export class ListInstructionsCommand extends SanityCommand<typeof ListInstructionsCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
  }

  static override description = 'List instructions for a knowledge base'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123',
      description: 'List all instructions for a knowledge base',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --json',
      description: 'Output instructions as JSON',
    },
  ]

  static override flags = {
    json: Flags.boolean({
      default: false,
      description: 'Output instructions in JSON format',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {knowledgeBaseId} = this.args
    const {json} = this.flags

    let instructions
    try {
      instructions = await listInstructions(knowledgeBaseId)
    } catch (error) {
      listInstructionsDebug('Error listing instructions', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to list instructions: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (json) {
      this.log(JSON.stringify(instructions, null, 2))
      return
    }

    if (instructions.length === 0) {
      this.log('No instructions found')
      return
    }

    const table = new Table({
      columns: [
        {alignment: 'left', name: 'id', title: 'ID'},
        {alignment: 'left', name: 'origin', title: 'Origin'},
        {alignment: 'left', name: 'status', title: 'Status'},
        {alignment: 'left', name: 'statement', title: 'Statement'},
        {alignment: 'left', name: 'createdAt', title: 'Created'},
      ],
    })

    for (const instruction of instructions) {
      table.addRow({
        createdAt: instruction._createdAt,
        id: instruction._id,
        origin: instruction.origin,
        statement: instruction.statement,
        status: instruction.status,
      })
    }

    this.log(table.render())
  }
}
