import {Args} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {formatKeyValue} from '../../../actions/debug/output.js'
import {getEntry} from '../../../services/context.js'

const getEntryDebug = subdebug('context:entries:get')

export class GetEntryCommand extends SanityCommand<typeof GetEntryCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
    path: Args.string({
      description: 'Entry path, as listed by `sanity context entries list`',
      required: true,
    }),
  }

  static override description = 'Get an entry and its content'

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 billing/refunds',
      description: 'Print an entry and its content',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 billing/refunds --json',
      description: 'Output the entry, including citations, as JSON',
    },
  ]

  public async run(): Promise<void> {
    const {knowledgeBaseId, path} = this.args
    const {json} = this.flags

    let entry
    try {
      entry = await getEntry(knowledgeBaseId, path)
    } catch (error) {
      getEntryDebug('Error getting entry', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to get entry: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (!entry) {
      this.error(`Entry "${path}" not found on knowledge base "${knowledgeBaseId}"`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (json) {
      this.logJson(entry)
      return
    }

    const padTo = 9 // "Citations" and "Generated" are the longest keys
    this.log(formatKeyValue('Path', entry.path, {padTo}))
    this.log(formatKeyValue('Title', entry.title, {padTo}))
    this.log(formatKeyValue('Status', entry.status, {padTo}))
    this.log(formatKeyValue('Scope', entry.tldr?.scope ?? '-', {padTo}))
    this.log(formatKeyValue('Citations', String(entry.citations?.length ?? 0), {padTo}))
    this.log(formatKeyValue('Generated', entry.generatedAt, {padTo}))

    if (entry.body) {
      this.log(`\n${entry.body}`)
    }
  }
}
