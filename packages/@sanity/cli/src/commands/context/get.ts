import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

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
    this.log(`ID:              ${knowledgeBase.publicId}`)
    this.log(`Title:           ${knowledgeBase.title}`)
    this.log(`Description:     ${knowledgeBase.description}`)
    this.log(`Organization:    ${knowledgeBase.organizationId}`)
    this.log(`State:           ${knowledgeBase.state}`)
    this.log(`Active job:      ${knowledgeBase.activeJobId ?? '-'}`)
    this.log(
      `Pending changes: ${
        pending
          ? `${pending.added} added, ${pending.changed} changed, ${pending.removed} removed`
          : '-'
      }`,
    )
    this.log(
      `Refresh:         ${
        knowledgeBase.refreshEnabled ? `enabled (${knowledgeBase.refreshFrequency})` : 'disabled'
      }`,
    )
    this.log(`Open issues:     ${knowledgeBase.openIssueCount}`)
    this.log(`Instructions:    ${knowledgeBase.instructionCount}`)
    this.log(`Created:         ${knowledgeBase.createdAt}`)
    this.log(`Updated:         ${knowledgeBase.updatedAt}`)
  }
}
