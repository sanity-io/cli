import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {type Context, isHttpError} from '@sanity/client'

import {readSourceFile} from '../../../actions/context/sourceFile.js'
import {formatKeyValue} from '../../../actions/debug/output.js'
import {uploadSourceFile} from '../../../services/context.js'
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
  ]

  static override flags = flags

  static telemetry = defineCommandTelemetry(flags, {redact: ['file']})

  public async run(): Promise<void> {
    const {knowledgeBaseId, sourceId} = this.args
    const {'content-type': contentType, file: filePath} = this.flags

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
    try {
      const {jobId} = await uploadSourceFile(knowledgeBaseId, sourceId, upload)
      spin.succeed('File uploaded and sync started')
      if (jobId) {
        this.log(formatKeyValue('Job ID', jobId))
        this.log(`Track it with: sanity context jobs get ${knowledgeBaseId} ${jobId}`)
      }
    } catch (error) {
      spin.fail()
      uploadSourceDebug('Error uploading source file', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Source "${sourceId}" not found on knowledge base "${knowledgeBaseId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to upload file: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
