import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {formatKeyValue} from '../../../actions/debug/output.js'
import {getSource, getSourceContent} from '../../../services/context.js'

const getSourceDebug = subdebug('context:sources:get')

export class GetSourceCommand extends SanityCommand<typeof GetSourceCommand> {
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

  static override description = 'Get details or the distilled content of a source'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 source-def456',
      description: 'Get details of a specific source',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 source-def456 --content',
      description: 'Print the distilled content of a source',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> kb-abc123 source-def456 --content --lines 10:20',
      description: 'Print lines 10 to 20 of the distilled content',
    },
  ]

  static override flags = {
    // No default: `dependsOn` treats a defaulted flag as provided, which would let --lines through alone
    content: Flags.boolean({
      description: 'Print the distilled content instead of the source details',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output the source in JSON format',
    }),
    lines: Flags.custom<{endLine: number; startLine: number}>({
      dependsOn: ['content'],
      description: 'Only print this line range of the content',
      helpValue: '<start:end>',
      parse: async (input: string) => {
        const match = /^(\d+):(\d+)$/.exec(input.trim())
        const startLine = Number(match?.[1])
        const endLine = Number(match?.[2])
        if (!match || startLine < 1 || endLine < startLine) {
          throw new Error(
            '`--lines` must be a range like 10:20, where start is at least 1 and end is not before start',
          )
        }
        return {endLine, startLine}
      },
    })(),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {knowledgeBaseId, sourceId} = this.args
    const {content, json, lines} = this.flags

    if (content) {
      const sourceContent = await this.requestSource(() =>
        getSourceContent(knowledgeBaseId, sourceId, lines),
      )
      this.log(json ? JSON.stringify(sourceContent, null, 2) : sourceContent.content)
      return
    }

    const result = await this.requestSource(() => getSource(knowledgeBaseId, sourceId))

    if (json) {
      this.log(JSON.stringify(result, null, 2))
      return
    }

    const padTo = 9 // "Distilled" is the longest key
    this.log(formatKeyValue('ID', result.id, {padTo}))
    this.log(formatKeyValue('Filename', result.filename, {padTo}))
    this.log(formatKeyValue('Kind', result.kind, {padTo}))
    this.log(formatKeyValue('Status', result.status, {padTo}))
    this.log(formatKeyValue('URL', result.canonicalUrl ?? '-', {padTo}))
    this.log(formatKeyValue('Size', `${result.sizeBytes} bytes`, {padTo}))
    this.log(formatKeyValue('Topics', result.topics?.join(', ') || '-', {padTo}))
    this.log(formatKeyValue('Summary', result.tldr ?? '-', {padTo}))
    this.log(formatKeyValue('Fetched', result.fetchedAt ?? '-', {padTo}))
    this.log(formatKeyValue('Distilled', result.distilledAt ?? '-', {padTo}))
    this.log(formatKeyValue('Created', result.createdAt, {padTo}))
  }

  private async requestSource<T>(request: () => Promise<T>): Promise<T> {
    const {knowledgeBaseId, sourceId} = this.args
    try {
      return await request()
    } catch (error) {
      getSourceDebug('Error getting source', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Source "${sourceId}" not found on knowledge base "${knowledgeBaseId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to get source: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
