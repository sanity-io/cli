import {writeFile} from 'node:fs/promises'

import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {type Context, isHttpError} from '@sanity/client'

import {getDocumentContent} from '../../../services/context.js'
import {defineCommandTelemetry} from '../../../util/telemetry/commandTelemetry.js'

const documentContentDebug = subdebug('context:documents:content')

/**
 * The lines of a JSON content view, each prefixed with its line number in the whole document
 */
function numberLines({content, slice}: Context.DocumentContent<'json'>): string {
  if (slice.start === 0) return ''
  const width = String(slice.end).length
  return content
    .split('\n')
    .slice(0, slice.end - slice.start + 1)
    .map((line, index) => `${String(slice.start + index).padStart(width)}  ${line}\n`)
    .join('')
}

const flags = {
  chunk: Flags.string({
    description: 'Only the lines of this chunk (chunk IDs are listed by `documents get --json`)',
    exclusive: ['lines'],
    helpValue: '<chunkId>',
  }),
  format: Flags.custom<'markdown' | 'plain' | 'raw'>({
    description:
      'markdown (the converted document, default), plain (the same markdown, sent as text/plain) or raw (the bytes the source gave, before conversion)',
    options: ['markdown', 'plain', 'raw'],
  })(),
  'line-numbers': Flags.boolean({
    default: false,
    description: 'Number each line as citations number them',
  }),
  lines: Flags.string({
    description: 'Only these lines, as `10-20`, or `10` for line 10 to the end',
    exclusive: ['chunk'],
    helpValue: '<from-to>',
    parse: async (input: string) => {
      const trimmed = input.trim()
      if (!/^\d+(?:-\d+)?$/.test(trimmed)) {
        throw new Error('`--lines` must be a line number or range, such as `10` or `10-20`')
      }
      return trimmed
    },
  }),
  output: Flags.string({
    char: 'o',
    description: 'Write the content to this file instead of stdout',
    helpValue: '<file>',
  }),
} satisfies FlagInput

export class DocumentContentCommand extends SanityCommand<typeof DocumentContentCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
    // eslint-disable-next-line perfectionist/sort-objects -- positional order: knowledge base first
    documentId: Args.string({
      description: 'Document ID',
      required: true,
    }),
  }

  static override description =
    'Print the markdown a document converted to, optionally with the line numbers citations use, or download its original bytes'

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 document-def456',
      description: "Print a document's markdown",
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 document-def456 --lines 10-20',
      description: 'Print lines 10 to 20',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> kb-abc123 document-def456 --lines 10-20 --line-numbers',
      description: 'Print lines 10 to 20, each with its line number',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> kb-abc123 document-def456 --format raw --output handbook.pdf',
      description: 'Download the original file',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 document-def456 --json',
      description: 'Output the content with its line range and total line count as JSON',
    },
  ]

  static override flags = flags

  static telemetry = defineCommandTelemetry(flags, {redact: ['output']})

  public async run(): Promise<void> {
    const {documentId, knowledgeBaseId} = this.args
    const {
      chunk,
      format = 'markdown',
      json,
      'line-numbers': lineNumbers,
      lines,
      output,
    } = this.flags

    if (json && (this.flags.format !== undefined || output !== undefined)) {
      this.error(
        '--json prints the JSON view of the content and cannot be combined with --format or --output.',
        {
          exit: exitCodes.USAGE_ERROR,
        },
      )
    }
    if (lineNumbers && (json || format !== 'markdown')) {
      this.error('--line-numbers only applies to markdown, without --json.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }
    if (format === 'raw' && output === undefined && process.stdout.isTTY) {
      this.error('Raw content is binary. Write it to a file with --output, or pipe it.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    const options = {...(chunk !== undefined && {chunk}), ...(lines !== undefined && {lines})}

    let content: string | Uint8Array
    try {
      if (json) {
        this.logJson(
          await getDocumentContent(knowledgeBaseId, documentId, {...options, format: 'json'}),
        )
        return
      }
      content = lineNumbers
        ? numberLines(
            await getDocumentContent(knowledgeBaseId, documentId, {...options, format: 'json'}),
          )
        : await getDocumentContent(knowledgeBaseId, documentId, {...options, format})
    } catch (error) {
      documentContentDebug('Error getting document content', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Document "${documentId}" not found on knowledge base "${knowledgeBaseId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to get document content: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (output === undefined) {
      process.stdout.write(content)
      return
    }

    try {
      await writeFile(output, content)
    } catch (error) {
      documentContentDebug('Error writing document content', error)
      this.error(`Failed to write "${output}": ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
    this.log(`Wrote ${output}`)
  }
}
