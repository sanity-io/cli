import {Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'

import {contextCommand} from '../../../actions/context/contextCommand.js'
import {type OperationRequest} from '../../../actions/context/operationInput.js'
import {readSourceFile} from '../../../actions/context/sourceFile.js'
import {uploadSourceFile} from '../../../services/context.js'
import {defineCommandTelemetry} from '../../../util/telemetry/commandTelemetry.js'

const BaseCommand = contextCommand('context sources upload')

const flags = {
  ...BaseCommand.flags,
  'content-type': Flags.string({
    description: 'MIME type of the file, inferred from the file extension when omitted',
    helpValue: '<type>',
  }),
  file: Flags.string({
    description: 'Local file to upload: a document, or a zip, tar or gzip archive of them',
    helpValue: '<path>',
    required: true,
  }),
} satisfies FlagInput

/**
 * `context sources upload` reads a local file and hands it to the client's
 * upload helper, which stages the upload, PUTs the bytes to the signed URL and
 * syncs the source. The spec's `startSourceUpload` only stages it.
 */
export class UploadSourceFileCommand extends BaseCommand {
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

  static override telemetry = defineCommandTelemetry(flags, {redact: ['file']})

  public override async send(
    request: OperationRequest,
    values: Record<string, unknown>,
  ): Promise<unknown> {
    const file = String(values.file)
    const contentType =
      typeof values['content-type'] === 'string' ? values['content-type'] : undefined
    let upload
    try {
      upload = await readSourceFile(file, contentType)
    } catch (error) {
      this.error(`Failed to read file "${file}": ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
    return uploadSourceFile(request.params.knowledgeBaseId, request.params.sourceId, upload)
  }
}
