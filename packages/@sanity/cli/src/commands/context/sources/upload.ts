import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {type Context, isHttpError} from '@sanity/client'

import {apiErrorCode} from '../../../actions/context/apiErrorCode.js'
import {readSourceFile} from '../../../actions/context/sourceFile.js'
import {formatSync, heldSyncHint} from '../../../actions/context/syncOutput.js'
import {formatSyncFailure, watchSourceSync} from '../../../actions/context/watchSourceSync.js'
import {formatKeyValue} from '../../../actions/debug/output.js'
import {getSource, uploadSourceFile} from '../../../services/context.js'
import {defineCommandTelemetry} from '../../../util/telemetry/commandTelemetry.js'

const uploadSourceDebug = subdebug('context:sources:upload')

const flags = {
  'content-type': Flags.string({
    description: 'MIME type of the file (inferred from the file extension when omitted)',
    helpValue: '<mime>',
    parse: async (input: string) => {
      const trimmed = input.trim()
      if (trimmed === '') {
        throw new Error('`--content-type` cannot be empty if provided')
      }
      return trimmed
    },
  }),
  file: Flags.string({
    description: 'Local file to upload: a document, or a zip, tar or gzip archive of them',
    helpValue: '<path>',
    required: true,
  }),
  watch: Flags.boolean({
    default: false,
    description:
      'Wait for the sync to finish, exiting non-zero if it fails; a held sync prints how to confirm or discard it',
  }),
} satisfies FlagInput

export class UploadSourceCommand extends SanityCommand<typeof UploadSourceCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),

    sourceId: Args.string({
      description: 'ID of a files source',
      required: true,
    }),
  }

  static override description =
    'Upload a new file to a files source, replacing the one it holds, and sync it'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 source-def456 --file ./handbook.pdf',
      description: 'Replace the file a source holds',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> kb-abc123 source-def456 --file ./handbook.pdf --watch',
      description: 'Replace the file and wait for its sync to finish',
    },
  ]

  static override flags = flags

  static telemetry = defineCommandTelemetry(flags, {redact: ['file']})

  public async run(): Promise<void> {
    const {knowledgeBaseId, sourceId} = this.args
    const {'content-type': contentType, file: filePath, watch} = this.flags

    let upload: Context.SourceFileUpload
    try {
      upload = await readSourceFile(filePath, contentType)
    } catch (error) {
      uploadSourceDebug('Error reading source file', error)
      this.error(`Failed to read file "${filePath}": ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    const spin = spinner('Uploading file').start()
    let previousSyncId: string | null
    try {
      previousSyncId = (await getSource(knowledgeBaseId, sourceId)).latestSync?.id ?? null
      await uploadSourceFile(knowledgeBaseId, sourceId, upload)
      spin.succeed('File uploaded, sync started')
    } catch (error) {
      spin.fail()
      uploadSourceDebug('Error uploading source file', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Source "${sourceId}" not found on knowledge base "${knowledgeBaseId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      if (apiErrorCode(error) === 'syncInProgress') {
        this.error(
          'The file was uploaded and kept, but its sync could not start because the source is already syncing. The source still holds its previous file. Run this command again once that sync finishes.',
          {exit: exitCodes.RUNTIME_ERROR},
        )
      }
      this.error(`Failed to upload file: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (watch) {
      await this.watchSync(knowledgeBaseId, sourceId, previousSyncId)
      return
    }

    let sync: Context.Sync | null = null
    try {
      const {latestSync} = await getSource(knowledgeBaseId, sourceId)
      if (latestSync && latestSync.id !== previousSyncId) sync = latestSync
    } catch (error) {
      uploadSourceDebug('Error reading the new sync', error)
    }

    if (!sync) {
      this.log(`Track its sync with: sanity context sources get ${knowledgeBaseId} ${sourceId}`)
      return
    }

    this.log(formatKeyValue('Sync ID', `${sync.id} (${sync.status})`))
    const hint = heldSyncHint(knowledgeBaseId, sync)
    if (hint) {
      this.log(`\n${hint}`)
      return
    }
    this.log(
      `Track it with: sanity context sources syncs get ${knowledgeBaseId} ${sourceId} ${sync.id}`,
    )
  }

  private async watchSync(
    knowledgeBaseId: string,
    sourceId: string,
    previousSyncId: string | null,
  ): Promise<void> {
    let sync: Context.Sync
    try {
      sync = await watchSourceSync(knowledgeBaseId, sourceId, previousSyncId)
    } catch (error) {
      uploadSourceDebug('Error watching sync', error)
      this.error(`Failed to watch sync: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    for (const line of formatSync(sync)) this.log(line)
    const hint = heldSyncHint(knowledgeBaseId, sync)
    if (hint) this.log(`\n${hint}`)

    if (sync.status === 'failed' || sync.status === 'cancelled') {
      this.error(formatSyncFailure(sync), {exit: exitCodes.RUNTIME_ERROR})
    }
  }
}
