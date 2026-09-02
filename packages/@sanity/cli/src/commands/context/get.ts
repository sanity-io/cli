import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {formatKeyValue} from '../../actions/debug/output.js'
import {getKnowledgeBase} from '../../services/context.js'

const getContextDebug = subdebug('context:get')

export class GetKnowledgeBaseCommand extends SanityCommand<typeof GetKnowledgeBaseCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
  }

  static override description = 'Get details of a knowledge base'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123',
      description: 'Get details of a specific knowledge base',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --json',
      description: 'Output the knowledge base as JSON',
    },
  ]

  static override flags = {
    json: Flags.boolean({
      default: false,
      description: 'Output the knowledge base in JSON format',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {knowledgeBaseId} = this.args
    const {json} = this.flags

    let knowledgeBase
    try {
      knowledgeBase = await getKnowledgeBase(knowledgeBaseId)
    } catch (error) {
      getContextDebug('Error getting knowledge base', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to get knowledge base: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (json) {
      this.log(JSON.stringify(knowledgeBase, null, 2))
      return
    }

    const pending = knowledgeBase.pendingChanges
    const padTo = 15 // "Pending changes" is the longest key
    this.log(formatKeyValue('ID', knowledgeBase.publicId, {padTo}))
    this.log(formatKeyValue('Title', knowledgeBase.title, {padTo}))
    this.log(formatKeyValue('Description', knowledgeBase.description, {padTo}))
    this.log(formatKeyValue('Organization', knowledgeBase.organizationId, {padTo}))
    this.log(formatKeyValue('State', knowledgeBase.state, {padTo}))
    this.log(formatKeyValue('Active job', knowledgeBase.activeJobId ?? '-', {padTo}))
    this.log(
      formatKeyValue(
        'Pending changes',
        pending
          ? `${pending.added} added, ${pending.changed} changed, ${pending.removed} removed`
          : '-',
        {padTo},
      ),
    )
    this.log(
      formatKeyValue(
        'Refresh',
        knowledgeBase.refreshEnabled ? `enabled (${knowledgeBase.refreshFrequency})` : 'disabled',
        {padTo},
      ),
    )
    this.log(formatKeyValue('Open issues', knowledgeBase.openIssueCount, {padTo}))
    this.log(formatKeyValue('Instructions', knowledgeBase.instructionCount, {padTo}))
    this.log(formatKeyValue('Created', knowledgeBase.createdAt, {padTo}))
    this.log(formatKeyValue('Updated', knowledgeBase.updatedAt, {padTo}))
  }
}
