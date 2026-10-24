import {Args} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {type Context, isHttpError} from '@sanity/client'

import {formatKeyValue} from '../../../actions/debug/output.js'
import {getSource} from '../../../services/context.js'

const getSourceDebug = subdebug('context:sources:get')

const padTo = 14 // "Sync frequency" is the longest key

function formatSettings(source: Context.Source): string[] {
  switch (source.type) {
    case 'files': {
      return [
        formatKeyValue('File', source.filename ?? '-', {padTo}),
        formatKeyValue('Size', source.sizeBytes ?? '-', {padTo}),
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
        formatKeyValue('Crawl options', source.crawlOptions, {padTo}),
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
    this.log(formatKeyValue('Chunks', source.chunkCount, {padTo}))
    this.log(formatKeyValue('Latest sync', sync ? `${sync.id} (${sync.status})` : '-', {padTo}))
    this.log(formatKeyValue('Last synced', source.lastSyncedAt ?? '-', {padTo}))
    this.log(formatKeyValue('Created', source.createdAt, {padTo}))
    this.log(formatKeyValue('Updated', source.updatedAt, {padTo}))
  }
}
