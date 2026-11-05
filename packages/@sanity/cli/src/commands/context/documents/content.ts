import {writeFile} from 'node:fs/promises'

import {Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'

import {contextCommand} from '../../../actions/context/contextCommand.js'
import {type OperationRequest} from '../../../actions/context/operationInput.js'
import {getDocumentBytes} from '../../../services/context.js'
import {defineCommandTelemetry} from '../../../util/telemetry/commandTelemetry.js'

const BaseCommand = contextCommand('context documents content')

/** The lines of a JSON content view, each prefixed with its line number in the whole document */
function numberLines(view: unknown): string {
  if (typeof view !== 'object' || view === null || !('content' in view) || !('slice' in view)) {
    return ''
  }
  const {content, slice} = view
  if (typeof content !== 'string' || typeof slice !== 'object' || slice === null) return ''
  const start = 'start' in slice && typeof slice.start === 'number' ? slice.start : 0
  const end = 'end' in slice && typeof slice.end === 'number' ? slice.end : 0
  if (start === 0) return ''
  const width = String(end).length
  return content
    .split('\n')
    .slice(0, end - start + 1)
    .map((line, index) => `${String(start + index).padStart(width)}  ${line}\n`)
    .join('')
}

const flags = {
  ...BaseCommand.flags,
  'line-numbers': Flags.boolean({
    default: false,
    description: 'Number each line as citations number them',
  }),
  output: Flags.string({
    char: 'o',
    description: 'Write the content to this file instead of stdout',
    helpValue: '<file>',
  }),
} satisfies FlagInput

/**
 * `context documents content` prints text and writes bytes: `--format raw`
 * downloads the bytes the source gave, which the spec types only as the JSON
 * view, and `--output` writes to a local file.
 */
export class GetDocumentContentCommand extends BaseCommand {
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 document-def456',
      description: "Print a document's markdown",
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
  ]

  static override flags = flags

  static override telemetry = defineCommandTelemetry(flags, {redact: ['output']})

  public override render(result: unknown): void {
    if (result instanceof Uint8Array && !this.flags.json && this.flags.output === undefined) {
      process.stdout.write(result)
      return
    }
    if (typeof result === 'string' && !this.flags.json && this.flags.output === undefined) {
      this.log(result.replace(/\n$/, ''))
      return
    }
    super.render(result)
  }

  public override async send(
    request: OperationRequest,
    values: Record<string, unknown>,
  ): Promise<unknown> {
    const output = typeof values.output === 'string' ? values.output : undefined
    const lineNumbers = Boolean(values['line-numbers'])
    const format = request.query.format ?? (values.json || lineNumbers ? 'json' : 'markdown')

    if (values.json && (values.format !== undefined || output !== undefined)) {
      this.error('--json prints the JSON view and cannot be combined with --format or --output.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }
    if (lineNumbers && format !== 'json') {
      this.error('--line-numbers only applies to markdown, without --json or --format.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }
    if (format === 'raw' && output === undefined && process.stdout.isTTY) {
      this.error('Raw content is binary. Write it to a file with --output, or pipe it.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    const query = {...request.query, format}
    const content =
      format === 'raw'
        ? await getDocumentBytes({...request, query})
        : await super.send({...request, query}, values)
    const printable = lineNumbers ? numberLines(content) : content
    if (output === undefined) return printable

    try {
      await writeFile(output, printable instanceof Uint8Array ? printable : String(printable))
    } catch (error) {
      this.error(`Failed to write "${output}": ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
    return `Wrote ${output}`
  }
}
