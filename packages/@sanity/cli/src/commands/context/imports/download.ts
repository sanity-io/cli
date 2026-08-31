import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {downloadImport} from '../../../services/context.js'

const downloadImportDebug = subdebug('context:imports:download')

export class DownloadImportCommand extends SanityCommand<typeof DownloadImportCommand> {
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

  static override description =
    'Get a short-lived signed URL for the original uploaded bytes of a file import'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 import-def456',
      description: 'Get a download URL for an uploaded file',
    },
  ]

  static override flags = {
    json: Flags.boolean({
      default: false,
      description: 'Output the download URL in JSON format',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {importId, knowledgeBaseId} = this.args
    const {json} = this.flags

    let download
    try {
      download = await downloadImport(knowledgeBaseId, importId)
    } catch (error) {
      downloadImportDebug('Error getting import download URL', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Import "${importId}" not found on knowledge base "${knowledgeBaseId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to get import download URL: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (json) {
      this.log(JSON.stringify(download, null, 2))
      return
    }

    this.log(`URL:     ${download.url}`)
    this.log(`Expires: ${download.expiresAt}`)
  }
}
