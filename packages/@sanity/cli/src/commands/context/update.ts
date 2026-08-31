import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {type Context, isHttpError} from '@sanity/client'

import {updateKnowledgeBase} from '../../services/context.js'
import {defineCommandTelemetry} from '../../util/telemetry/commandTelemetry.js'

const updateContextDebug = subdebug('context:update')

const UPDATE_FLAGS = ['title', 'description', 'refresh-enabled', 'refresh-frequency'] as const

const flags = {
  description: Flags.string({
    atLeastOne: [...UPDATE_FLAGS],
    description: 'New knowledge base description',
    required: false,
  }),
  'refresh-enabled': Flags.boolean({
    allowNo: true,
    atLeastOne: [...UPDATE_FLAGS],
    description: 'Enable scheduled refresh (--no-refresh-enabled to disable)',
    required: false,
  }),
  'refresh-frequency': Flags.string({
    atLeastOne: [...UPDATE_FLAGS],
    description: 'How often scheduled refresh runs',
    options: ['weekly', 'monthly'],
    required: false,
  }),
  title: Flags.string({
    atLeastOne: [...UPDATE_FLAGS],
    description: 'New knowledge base title',
    required: false,
  }),
} satisfies FlagInput

export class UpdateKnowledgeBaseCommand extends SanityCommand<typeof UpdateKnowledgeBaseCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
  }

  static override description = 'Update a knowledge base'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --title "New title"',
      description: 'Rename a knowledge base',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> kb-abc123 --refresh-enabled --refresh-frequency weekly',
      description: 'Enable weekly scheduled refresh',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --no-refresh-enabled',
      description: 'Disable scheduled refresh',
    },
  ]

  static override flags = flags

  static telemetry = defineCommandTelemetry(flags, {redact: ['title', 'description']})

  public async run(): Promise<void> {
    const {knowledgeBaseId} = this.args
    const {
      description,
      'refresh-enabled': refreshEnabled,
      'refresh-frequency': refreshFrequency,
      title,
    } = this.flags

    const params: Context.EditKnowledgeBaseParams = {}
    if (title !== undefined) {
      const trimmedTitle = title.trim()
      if (trimmedTitle === '') {
        this.error('Title cannot be empty', {exit: exitCodes.USAGE_ERROR})
      }
      params.title = trimmedTitle
    }
    if (description !== undefined) {
      const trimmedDescription = description.trim()
      if (trimmedDescription === '') {
        this.error('Description cannot be empty', {exit: exitCodes.USAGE_ERROR})
      }
      params.description = trimmedDescription
    }
    if (refreshEnabled !== undefined) {
      params.refreshEnabled = refreshEnabled
    }
    if (refreshFrequency !== undefined) {
      params.refreshFrequency =
        refreshFrequency as Context.EditKnowledgeBaseParams['refreshFrequency']
    }

    const spin = spinner('Updating knowledge base').start()
    try {
      await updateKnowledgeBase(knowledgeBaseId, params)
      spin.succeed()
      this.log('Knowledge base updated')
    } catch (error) {
      spin.fail()
      updateContextDebug('Error updating knowledge base', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to update knowledge base: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
