import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {formatKeyValue} from '../../../actions/debug/output.js'
import {getImport} from '../../../services/context.js'

const getImportDebug = subdebug('context:imports:get')

export class GetImportCommand extends SanityCommand<typeof GetImportCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
    // eslint-disable-next-line perfectionist/sort-objects -- positional order: knowledge base first
    importId: Args.string({
      description: 'Import ID',
      required: true,
    }),
  }

  static override description = 'Get details of an import'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 import-def456',
      description: 'Get details of a specific import',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 import-def456 --json',
      description: 'Output the import as JSON',
    },
  ]

  static override flags = {
    json: Flags.boolean({
      default: false,
      description: 'Output the import in JSON format',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {importId, knowledgeBaseId} = this.args
    const {json} = this.flags

    let importDetail
    try {
      importDetail = await getImport(knowledgeBaseId, importId)
    } catch (error) {
      getImportDebug('Error getting import', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Import "${importId}" not found on knowledge base "${knowledgeBaseId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to get import: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (json) {
      this.log(JSON.stringify(importDetail, null, 2))
      return
    }

    const padTo = 9 // "Completed" is the longest key
    this.log(formatKeyValue('ID', importDetail.id, {padTo}))
    this.log(formatKeyValue('Name', importDetail.name ?? '-', {padTo}))
    this.log(formatKeyValue('Kind', importDetail.sourceKind, {padTo}))
    this.log(formatKeyValue('Status', importDetail.status, {padTo}))
    this.log(formatKeyValue('Detail', importDetail.statusDetail ?? '-', {padTo}))
    this.log(formatKeyValue('Error', importDetail.error ?? '-', {padTo}))
    this.log(formatKeyValue('Sources', importDetail.sourceCount, {padTo}))
    this.log(
      formatKeyValue(
        'Distilled',
        `${importDetail.distilledCount}/${importDetail.totalDistillableCount}`,
        {padTo},
      ),
    )
    this.log(formatKeyValue('Created', importDetail.createdAt, {padTo}))
    this.log(formatKeyValue('Completed', importDetail.completedAt ?? '-', {padTo}))
  }
}
