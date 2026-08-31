import {readFile} from 'node:fs/promises'
import {basename, extname} from 'node:path'

import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {type Context, isHttpError} from '@sanity/client'

import {createImport} from '../../../services/context.js'
import {defineCommandTelemetry} from '../../../util/telemetry/commandTelemetry.js'

const createImportDebug = subdebug('context:imports:create')

const TEXT_CONTENT_TYPES = ['text/markdown', 'text/plain'] as const

function isTextContentType(value: string): value is (typeof TEXT_CONTENT_TYPES)[number] {
  const textContentTypes: readonly string[] = TEXT_CONTENT_TYPES
  return textContentTypes.includes(value)
}

const FILE_CONTENT_TYPES: Record<string, string> = {
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.htm': 'text/html',
  '.html': 'text/html',
  '.json': 'application/json',
  '.markdown': 'text/markdown',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
}

const flags = {
  'content-type': Flags.string({
    description:
      'Content type of the import (--text: text/markdown or text/plain; --file: any MIME type, inferred from the file extension when omitted)',
    helpValue: '<mime>',
    required: false,
  }),
  file: Flags.string({
    description: 'Path to a local file to import',
    exclusive: ['text', 'url', 'query'],
    helpValue: '<path>',
    required: false,
  }),
  query: Flags.string({
    description: 'GROQ query binding a Sanity dataset as a source',
    exclusive: ['text', 'url', 'file'],
    required: false,
  }),
  'sanity-dataset': Flags.string({
    dependsOn: ['query'],
    description: 'Sanity dataset for a dataset import',
    helpValue: '<name>',
    required: false,
  }),
  'sanity-project': Flags.string({
    dependsOn: ['query'],
    description: 'Sanity project ID for a dataset import',
    helpValue: '<id>',
    required: false,
  }),
  text: Flags.string({
    description: 'Inline text content to import (requires --title)',
    exclusive: ['file', 'url', 'query'],
    required: false,
  }),
  title: Flags.string({
    dependsOn: ['text'],
    description: 'Title for an inline text import',
    required: false,
  }),
  url: Flags.string({
    description: 'Website URL to crawl',
    exclusive: ['text', 'file', 'query'],
    helpValue: '<url>',
    required: false,
  }),
} satisfies FlagInput

export class CreateImportCommand extends SanityCommand<typeof CreateImportCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
  }

  static override description = 'Import content into a knowledge base'

  static override examples = [
    {
      command:
        '<%= config.bin %> <%= command.id %> kb-abc123 --text "Refunds are processed within 5 days" --title "Refund policy"',
      description: 'Import inline text',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --file ./handbook.pdf',
      description: 'Upload and import a local file',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --url https://example.com/docs',
      description: 'Crawl a website',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> kb-abc123 --query \'*[_type == "article"]\' --sanity-project abc123 --sanity-dataset production',
      description: 'Bind a Sanity dataset as a source',
    },
  ]

  static override flags = flags

  static telemetry = defineCommandTelemetry(flags, {
    redact: ['text', 'file', 'url', 'title', 'query'],
  })

  public async run(): Promise<void> {
    const {knowledgeBaseId} = this.args

    const params = await this.buildImportParams()

    const spin = spinner('Creating import').start()
    try {
      const {jobId} = await createImport(knowledgeBaseId, params)
      spin.succeed('Import created')
      this.log(`Job ID: ${jobId}`)
      this.log(`Track it with: sanity context jobs get ${knowledgeBaseId} ${jobId}`)
    } catch (error) {
      spin.fail()
      createImportDebug('Error creating import', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to create import: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }

  private async buildFileImportParams(filePath: string): Promise<Context.CreateFileImportParams> {
    const {'content-type': contentType} = this.flags

    let fileContent: Buffer
    try {
      fileContent = await readFile(filePath)
    } catch (error) {
      createImportDebug('Error reading import file', error)
      this.error(`Failed to read file "${filePath}": ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    // The Context API signs the upload URL for a content-type header, so one
    // must always be sent or the upload fails (API quirk found in live testing).
    const inferredContentType =
      FILE_CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'

    return {
      contentType: contentType ?? inferredContentType,
      file: fileContent,
      filename: basename(filePath),
      type: 'file',
    }
  }

  private async buildImportParams(): Promise<
    Context.CreateFileImportParams | Context.CreateImportParams
  > {
    const {
      'content-type': contentType,
      file,
      query,
      'sanity-dataset': sanityDataset,
      'sanity-project': sanityProject,
      text,
      url,
    } = this.flags

    const sources: [flag: '--file' | '--query' | '--text' | '--url', value: string | undefined][] =
      [
        ['--text', text],
        ['--file', file],
        ['--url', url],
        ['--query', query],
      ]
    const provided = sources.filter(([, value]) => value !== undefined)
    if (provided.length !== 1) {
      this.error('Provide exactly one of --text, --file, --url or --query.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    const [sourceFlag, sourceValue] = provided[0]
    if (!sourceValue?.trim()) {
      this.error(`${sourceFlag} cannot be empty`, {exit: exitCodes.USAGE_ERROR})
    }

    if (sourceFlag === '--text') {
      return this.buildTextImportParams(sourceValue)
    }

    if (sourceFlag === '--file') {
      return this.buildFileImportParams(sourceValue)
    }

    if (contentType !== undefined) {
      this.error('The --content-type flag only applies to --text and --file imports.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    if (sourceFlag === '--url') {
      return {type: 'crawl', url: sourceValue}
    }

    // Only --query remains; the checks above narrow `sourceFlag` to '--query'.
    if (!sanityProject || !sanityDataset) {
      this.error(
        'Dataset imports require --sanity-project and --sanity-dataset alongside --query.',
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    return {
      query: sourceValue,
      sanityDatasetId: sanityDataset,
      sanityProjectId: sanityProject,
      type: 'dataset',
    }
  }

  private buildTextImportParams(text: string): Context.CreateImportParams {
    const {'content-type': contentType, title} = this.flags

    if (!title?.trim()) {
      this.error('Title is required for text imports. Provide it with the --title flag.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    if (contentType !== undefined && !isTextContentType(contentType)) {
      this.error(
        `Text imports support content types ${TEXT_CONTENT_TYPES.join(' and ')}, got "${contentType}".`,
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    return {
      content: text,
      title: title.trim(),
      type: 'text',
      ...(contentType === undefined ? {} : {contentType}),
    }
  }
}
