import {Args} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {type Context, isHttpError} from '@sanity/client'

import {type CrawlOptions} from '../../../actions/context/crawlFlags.js'
import {formatKeyValue} from '../../../actions/debug/output.js'
import {getSource} from '../../../services/context.js'

const getSourceDebug = subdebug('context:sources:get')

const padTo = 14 // "Sync frequency" is the longest key

function formatCrawlOptions(options: CrawlOptions | null | undefined): string[] {
  const values: [string, boolean | number | string[] | undefined][] = [
    ['Include paths', options?.includePaths],
    ['Exclude paths', options?.excludePaths],
    ['Max depth', options?.maxDepth],
    ['Page limit', options?.pageLimit],
    ['Sitemap only', options?.sitemapOnly],
    ['Ignore query params', options?.ignoreQueryParameters],
  ]
  const set = values.filter(([, value]) => value !== undefined)
  if (set.length === 0) return [formatKeyValue('Crawl options', 'defaults', {padTo})]
  return [
    formatKeyValue('Crawl options', '', {padTo}).trimEnd(),
    ...set.map(([key, value]) =>
      formatKeyValue(key, Array.isArray(value) ? value.join(', ') : String(value), {
        indent: 4,
        padTo: 19, // "Ignore query params"
      }),
    ),
  ]
}

function formatSettings(source: Context.Source): string[] {
  switch (source.type) {
    case 'files': {
      return [
        formatKeyValue('File', source.filename ?? '-', {padTo}),
        formatKeyValue('Size', String(source.sizeBytes ?? '-'), {padTo}),
      ]
    }
    case 'sanity-dataset': {
      return [
        formatKeyValue('Project', source.sanityProjectId, {padTo}),
        formatKeyValue('Dataset', source.sanityDatasetId, {padTo}),
        formatKeyValue('Query', source.query, {padTo}),
        formatKeyValue('Sync frequency', source.syncFrequency ?? 'off', {padTo}),
      ]
    }
    case 'web': {
      return [
        formatKeyValue('URL', source.url, {padTo}),
        ...formatCrawlOptions(source.crawlOptions),
        formatKeyValue('Sync frequency', source.syncFrequency ?? 'off', {padTo}),
      ]
    }
  }
}

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

  static override description = 'Get details of a source'

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 source-def456',
      description: 'Get details of a source, including its latest sync',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 source-def456 --json',
      description: 'Output the source as JSON',
    },
  ]

  public async run(): Promise<void> {
    const {knowledgeBaseId, sourceId} = this.args
    const {json} = this.flags

    let source
    try {
      source = await getSource(knowledgeBaseId, sourceId)
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

    if (json) {
      this.logJson(source)
      return
    }

    const sync = source.latestSync
    this.log(formatKeyValue('ID', source.id, {padTo}))
    this.log(formatKeyValue('Title', source.title, {padTo}))
    this.log(formatKeyValue('Type', source.type, {padTo}))
    for (const line of formatSettings(source)) this.log(line)
    this.log(
      formatKeyValue(
        'Documents',
        `${source.documentCount} (${source.convertedDocumentCount} converted, ${source.skippedDocumentCount} skipped, ${source.failedDocumentCount} failed)`,
        {padTo},
      ),
    )
    this.log(formatKeyValue('Chunks', String(source.chunkCount), {padTo}))
    this.log(formatKeyValue('Latest sync', sync ? `${sync.id} (${sync.status})` : '-', {padTo}))
    this.log(formatKeyValue('Last synced', source.lastSyncedAt ?? '-', {padTo}))
    this.log(formatKeyValue('Created', source.createdAt, {padTo}))
    this.log(formatKeyValue('Updated', source.updatedAt, {padTo}))
  }
}
