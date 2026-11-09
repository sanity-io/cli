import {readFile} from 'node:fs/promises'
import {basename} from 'node:path'
import {text as readStream} from 'node:stream/consumers'

import {Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'

import {contextCommand} from '../../../actions/context/contextCommand.js'
import {flagName, type OperationRequest} from '../../../actions/context/operationInput.js'
import {readSourceFile} from '../../../actions/context/sourceFile.js'
import {createFileSource} from '../../../services/context.js'
import {defineCommandTelemetry} from '../../../util/telemetry/commandTelemetry.js'

const BaseCommand = contextCommand('context sources create')

const SOURCE_FLAGS = ['url', 'query', 'file', 'text'] as const

/** The body fields a `--file` source takes; the file supplies the rest */
const FILE_BODY_FIELDS = new Set(['contentType', 'title'])

const flags = {
  ...BaseCommand.flags,
  file: Flags.string({
    description:
      'Local file to upload as a files source: a document, or a zip, tar or gzip archive of them',
    exclusive: ['url', 'query', 'text'],
    helpValue: '<path>',
  }),
  query: {...BaseCommand.flags.query, exclusive: ['url', 'file', 'text']},
  text: Flags.string({
    description:
      'Text or markdown to hold as a files source, read from a local file or `-` for stdin',
    exclusive: ['url', 'query', 'file'],
    helpValue: '<path|->',
  }),
  url: {...BaseCommand.flags.url, exclusive: ['query', 'file', 'text']},
} satisfies FlagInput

/**
 * `context sources create` adds `--file`, which uploads a local file to a
 * signed URL, and `--text`, which reads the content of a files source from a
 * file or stdin. The rest is the spec's `createSource`.
 */
export class CreateSourceCommand extends BaseCommand {
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --url https://example.com/docs',
      description: 'Crawl a website',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> kb-abc123 --url https://example.com/docs --dry-run',
      description: 'Estimate how many pages a crawl of /docs would find, without adding it',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> kb-abc123 --query \'*[_type == "article"]\' --sanity-project-id abc123 --sanity-dataset-id production',
      description: 'Read the documents a GROQ query selects from a Sanity dataset',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --file ./handbook.pdf --watch',
      description: 'Upload a local file and wait for its sync',
    },
    {
      command:
        'cat refunds.md | <%= config.bin %> <%= command.id %> kb-abc123 --text - --title "Refund policy"',
      description: 'Add markdown from stdin',
    },
  ]

  static override flags = flags

  static override telemetry = {
    redactedFlags: [
      ...BaseCommand.telemetry.redactedFlags,
      ...defineCommandTelemetry(flags, {redact: ['file', 'text']}).redactedFlags,
    ],
  }

  public override async send(
    request: OperationRequest,
    values: Record<string, unknown>,
  ): Promise<unknown> {
    const body = request.body ?? {}
    const title = typeof body.title === 'string' ? body.title : undefined
    const {file, text} = values

    const given = SOURCE_FLAGS.filter((name) => values[name] !== undefined)
    if (given.length > 1 || (given.length === 0 && body.type !== 'files')) {
      this.error(
        'Provide exactly one of --url, --query, --file or --text, or `--type files --title <title>` for a files source whose file comes later with `sources upload`.',
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    if (typeof file === 'string') {
      // Nested fields such as `crawlOptions.maxDepth` come from flags named after the field itself
      const ignored = Object.entries(body).flatMap(([key, value]) => {
        if (key === 'type') return value === 'files' || values.type === undefined ? [] : [key]
        if (FILE_BODY_FIELDS.has(key)) return []
        return typeof value === 'object' && value !== null && !Array.isArray(value)
          ? Object.keys(value)
          : [key]
      })
      if (ignored.length > 0) {
        this.error(
          `--file adds a files source, which takes only --title and --content-type. Remove ${ignored.map((name) => `--${flagName({name})}`).join(', ')}.`,
          {exit: exitCodes.USAGE_ERROR},
        )
      }
      const upload = await this.read(`file "${file}"`, () =>
        readSourceFile(file, typeof body.contentType === 'string' ? body.contentType : undefined),
      )
      // The created source has no sync yet; `jobId` lets the output and `--watch` follow the upload's
      const {source, sync} = await createFileSource(request.params.knowledgeBaseId, {
        ...upload,
        title: title ?? upload.filename,
        type: 'files',
      })
      return {...source, jobId: sync.jobId}
    }

    if (typeof text === 'string') {
      const fromStdin = text === '-'
      if (fromStdin && !title) {
        this.error('Text read from stdin needs a title. Provide it with the --title flag.', {
          exit: exitCodes.USAGE_ERROR,
        })
      }
      const content = await this.read(fromStdin ? 'stdin' : `file "${text}"`, () =>
        fromStdin ? readStream(process.stdin) : readFile(text, 'utf8'),
      )
      if (content.trim() === '') {
        this.error('Text content cannot be empty', {exit: exitCodes.USAGE_ERROR})
      }
      return super.send(
        {...request, body: {...body, content, title: title ?? basename(text), type: 'files'}},
        values,
      )
    }

    return super.send(request, values)
  }

  private async read<T>(what: string, read: () => Promise<T>): Promise<T> {
    try {
      return await read()
    } catch (error) {
      this.error(`Failed to read ${what}: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
