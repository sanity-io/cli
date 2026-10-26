import {readFile} from 'node:fs/promises'
import {basename} from 'node:path'
import {text as readStream} from 'node:stream/consumers'

import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {type Context, isHttpError} from '@sanity/client'

import {crawlFlags, crawlOptionsFromFlags} from '../../../actions/context/crawlFlags.js'
import {readSourceFile} from '../../../actions/context/sourceFile.js'
import {contextTable} from '../../../actions/context/table.js'
import {formatKeyValue} from '../../../actions/debug/output.js'
import {createSource, previewWebSource} from '../../../services/context.js'
import {getDatasetFlag, getProjectIdFlag} from '../../../util/sharedFlags.js'
import {defineCommandTelemetry} from '../../../util/telemetry/commandTelemetry.js'

const createSourceDebug = subdebug('context:sources:create')

const TEXT_CONTENT_TYPES: Record<string, 'text/markdown' | 'text/plain'> = {
  markdown: 'text/markdown',
  plain: 'text/plain',
  'text/markdown': 'text/markdown',
  'text/plain': 'text/plain',
}

const SOURCE_FLAGS = ['url', 'query', 'file', 'text'] as const

const flags = {
  ...crawlFlags,
  ...getDatasetFlag({
    dependsOn: ['query'],
    description: 'Dataset to read documents from (with --query)',
    semantics: 'specify',
  }),
  ...getProjectIdFlag({
    dependsOn: ['query'],
    description: 'Project to read documents from (with --query)',
    semantics: 'specify',
  }),
  'content-type': Flags.string({
    description:
      'Format of --text content (markdown or plain, default markdown), or the MIME type of --file (inferred from the file extension when omitted)',
    helpValue: '<type>',
    parse: async (input: string) => {
      const trimmed = input.trim()
      if (trimmed === '') {
        throw new Error('`--content-type` cannot be empty if provided')
      }
      return trimmed
    },
  }),
  'dry-run': Flags.boolean({
    default: false,
    description:
      'Estimate how many pages the site has under --url, grouped by path, without adding the source. The estimate does not apply the crawl flags',
  }),
  file: Flags.string({
    description:
      'Local file to upload as a files source: a document, or a zip, tar or gzip archive of them',
    exclusive: ['url', 'query', 'text'],
    helpValue: '<path>',
  }),
  query: Flags.string({
    description: 'GROQ query selecting the documents of a Sanity dataset to read',
    exclusive: ['url', 'file', 'text'],
    helpValue: '<groq>',
  }),
  text: Flags.string({
    description:
      'Text or markdown to hold as a files source, read from a local file or `-` for stdin',
    exclusive: ['url', 'query', 'file'],
    helpValue: '<path|->',
  }),
  title: Flags.string({
    description: 'Title of a files source (defaults to the file name)',
  }),
  url: Flags.string({
    description: 'Website URL to crawl',
    exclusive: ['query', 'file', 'text'],
    helpValue: '<url>',
  }),
} satisfies FlagInput

export class CreateSourceCommand extends SanityCommand<typeof CreateSourceCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
  }

  static override description =
    'Add a website, Sanity dataset or file to a knowledge base and start its first sync'

  static override enableJsonFlag = true

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
        '<%= config.bin %> <%= command.id %> kb-abc123 --query \'*[_type == "article"]\' --project-id abc123 --dataset production',
      description: 'Read the documents a GROQ query selects from a Sanity dataset',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --file ./handbook.pdf',
      description: 'Upload a local file',
    },
    {
      command:
        'cat refunds.md | <%= config.bin %> <%= command.id %> kb-abc123 --text - --title "Refund policy"',
      description: 'Add markdown from stdin',
    },
  ]

  static override flags = flags

  static telemetry = defineCommandTelemetry(flags, {
    redact: ['exclude-path', 'file', 'include-path', 'query', 'text', 'title', 'url'],
  })

  public async run(): Promise<void> {
    const {knowledgeBaseId} = this.args
    const {'dry-run': dryRun, json, url} = this.flags

    const crawlOptions = crawlOptionsFromFlags(this.flags)
    if (url === undefined && crawlOptions) {
      this.error('Crawl flags only apply to --url sources.', {exit: exitCodes.USAGE_ERROR})
    }

    if (dryRun && url === undefined) {
      this.error('The --dry-run flag only applies to --url sources.', {exit: exitCodes.USAGE_ERROR})
    }

    if (dryRun && url !== undefined) {
      await this.preview(knowledgeBaseId, {url, ...(crawlOptions && {crawlOptions})})
      return
    }

    const params = await this.buildSourceParams()

    const spin = spinner(
      params.type === 'files' ? 'Adding and syncing source' : 'Adding source',
    ).start()
    let source: Context.Source
    try {
      source = await createSource(knowledgeBaseId, params)
      spin.succeed('Source added')
    } catch (error) {
      spin.fail()
      createSourceDebug('Error creating source', error)
      this.failRequest(knowledgeBaseId, 'add source', error)
    }

    if (json) {
      this.logJson(source)
      return
    }

    this.log(formatKeyValue('Source ID', source.id))
    const sync = source.latestSync
    if (sync) {
      this.log(formatKeyValue('Sync ID', `${sync.id} (${sync.status})`))
      this.log(
        `Track it with: sanity context sources syncs get ${knowledgeBaseId} ${source.id} ${sync.id}`,
      )
    } else {
      this.log(
        `Track its first sync with: sanity context sources get ${knowledgeBaseId} ${source.id}`,
      )
    }
  }

  private async buildFileParams(filePath: string): Promise<Context.CreateSourceParams> {
    const {'content-type': contentType, title} = this.flags

    let upload: Context.SourceFileUpload
    try {
      upload = await readSourceFile(filePath, contentType)
    } catch (error) {
      createSourceDebug('Error reading source file', error)
      this.error(`Failed to read file "${filePath}": ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    return {...upload, title: this.resolveTitle(title, upload.filename), type: 'files'}
  }

  private async buildSourceParams(): Promise<Context.CreateSourceParams> {
    const {
      'content-type': contentType,
      dataset,
      file,
      'project-id': projectId,
      query,
      text,
      title,
      url,
    } = this.flags

    const provided = SOURCE_FLAGS.filter((name) => this.flags[name] !== undefined)
    if (provided.length !== 1) {
      this.error('Provide exactly one of --url, --query, --file or --text.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    const [sourceFlag] = provided
    const sourceValue = {file, query, text, url}[sourceFlag]
    if (!sourceValue?.trim()) {
      this.error(`--${sourceFlag} cannot be empty`, {exit: exitCodes.USAGE_ERROR})
    }

    if (sourceFlag === 'file') return this.buildFileParams(sourceValue)
    if (sourceFlag === 'text') return this.buildTextParams(sourceValue)

    if (contentType !== undefined) {
      this.error('The --content-type flag only applies to --file and --text sources.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }
    if (title !== undefined) {
      this.error(
        'The --title flag only applies to --file and --text sources. Rename a source with `sanity context sources edit`.',
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    if (sourceFlag === 'url') {
      const crawlOptions = crawlOptionsFromFlags(this.flags)
      return {type: 'web', url: sourceValue, ...(crawlOptions && {crawlOptions})}
    }

    if (!projectId || !dataset) {
      this.error('Dataset sources require --project-id and --dataset alongside --query.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    return {
      query: sourceValue,
      sanityDatasetId: dataset,
      sanityProjectId: projectId,
      type: 'sanity-dataset',
    }
  }

  private async buildTextParams(input: string): Promise<Context.CreateSourceParams> {
    const {'content-type': contentTypeFlag, title} = this.flags

    const contentType =
      contentTypeFlag === undefined ? undefined : TEXT_CONTENT_TYPES[contentTypeFlag]
    if (contentTypeFlag !== undefined && contentType === undefined) {
      this.error(`Text sources are markdown or plain, got "${contentTypeFlag}".`, {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    const fromStdin = input === '-'
    if (fromStdin && !title?.trim()) {
      this.error('Text read from stdin needs a title. Provide it with the --title flag.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    let content: string
    try {
      content = fromStdin ? await readStream(process.stdin) : await readFile(input, 'utf8')
    } catch (error) {
      createSourceDebug('Error reading source text', error)
      this.error(
        `Failed to read ${fromStdin ? 'stdin' : `file "${input}"`}: ${getErrorMessage(error)}`,
        {exit: exitCodes.RUNTIME_ERROR},
      )
    }

    if (content.trim() === '') {
      this.error('Text content cannot be empty', {exit: exitCodes.USAGE_ERROR})
    }

    return {
      content,
      title: this.resolveTitle(title, basename(input)),
      type: 'files',
      ...(contentType && {contentType}),
    }
  }

  private failRequest(knowledgeBaseId: string, action: string, error: unknown): never {
    if (isHttpError(error) && error.statusCode === 404) {
      this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
    this.error(`Failed to ${action}: ${getErrorMessage(error)}`, {
      exit: exitCodes.RUNTIME_ERROR,
    })
  }

  private async preview(
    knowledgeBaseId: string,
    params: Context.PreviewWebSourceParams,
  ): Promise<void> {
    const spin = spinner('Estimating crawl').start()
    let preview: Context.CrawlPreview
    try {
      preview = await previewWebSource(knowledgeBaseId, params)
      spin.succeed('Crawl estimated')
    } catch (error) {
      spin.fail()
      createSourceDebug('Error previewing crawl', error)
      this.failRequest(knowledgeBaseId, 'estimate crawl', error)
    }

    if (this.flags.json) {
      this.logJson(preview)
      return
    }

    const padTo = 11 // "Pages found" is the longest key
    this.log(
      formatKeyValue(
        'Pages found',
        `${preview.truncated ? 'more than ' : '~'}${preview.totalPages}`,
        {padTo},
      ),
    )
    const pageLimit = params.crawlOptions?.pageLimit
    if (pageLimit !== undefined) {
      this.log(formatKeyValue('Page limit', String(pageLimit), {padTo}))
    }
    if (params.crawlOptions) {
      this.log(
        'The estimate counts the pages under the URL before the crawl flags apply, so a crawl with them can fetch fewer.',
      )
    }
    if (preview.groups.length === 0) return

    const table = contextTable({
      columns: [
        {alignment: 'left', name: 'prefix', title: 'Path'},
        {alignment: 'right', name: 'count', title: 'Pages'},
      ],
    })
    for (const {count, prefix} of preview.groups) table.addRow({count, prefix})
    if (preview.otherCount > 0) table.addRow({count: preview.otherCount, prefix: '(other)'})
    this.log(table.render())
  }

  private resolveTitle(title: string | undefined, fallback: string): string {
    if (title === undefined) return fallback
    const trimmed = title.trim()
    if (trimmed === '') {
      this.error('Title cannot be empty', {exit: exitCodes.USAGE_ERROR})
    }
    return trimmed
  }
}
