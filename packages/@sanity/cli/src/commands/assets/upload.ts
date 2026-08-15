import {basename, resolve} from 'node:path'

import {Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {AssetFileError} from '../../actions/assets/assetFileError.js'
import {uploadAssetWithProgress} from '../../actions/assets/uploadAssetWithProgress.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {type AssetType} from '../../services/assets.js'
import {getDatasetFlag, getProjectIdFlag} from '../../util/sharedFlags.js'
import {defineCommandTelemetry} from '../../util/telemetry/commandTelemetry.js'

const uploadAssetDebug = subdebug('assets:upload')
const DATASET_ASSET_LIMITS_URL =
  'https://www.sanity.io/docs/content-lake/technical-limits#k2c53dc30e24b'

function getAssetUploadErrorMessage(error: unknown): string {
  if (!isHttpError(error)) {
    return `Asset upload failed: ${getErrorMessage(error)}`
  }

  const body =
    typeof error.response.body === 'object' &&
    error.response.body !== null &&
    !Array.isArray(error.response.body)
      ? (error.response.body as Record<string, unknown>)
      : {}
  const responseError =
    typeof body.error === 'string' ? body.error : error.response.statusMessage || 'HTTP error'
  const statusCode =
    typeof body.statusCode === 'number' || typeof body.statusCode === 'string'
      ? body.statusCode
      : error.statusCode
  const responseMessage = getErrorMessage(error)
  const message = /[.!?]$/.test(responseMessage) ? responseMessage : `${responseMessage}.`
  const details = typeof body.details === 'string' ? `\n\nDetails:\n${body.details}` : ''
  const response = `Asset upload failed: HTTP ${statusCode} - ${responseError}\n${message}${details}`

  if (error.statusCode === 401) {
    return `${response}\n\nRun \`sanity login\` to authenticate, then try again.`
  }
  if (error.statusCode === 403) {
    return `${response}\n\nCheck that your account has write access to this dataset, then try again.`
  }
  if ([400, 413, 422].includes(error.statusCode)) {
    return `${response}\n\nCheck the asset requirements and current technical limits, then try again: ${DATASET_ASSET_LIMITS_URL}`
  }
  return `${response}\n\nTry again.`
}

const flags = {
  ...getProjectIdFlag({
    description: 'Project ID to upload the asset to',
    semantics: 'override',
  }),
  ...getDatasetFlag({description: 'Dataset to upload the asset to', semantics: 'override'}),
  'content-type': Flags.string({
    description: 'MIME type of the asset, such as image/png or application/pdf',
    helpValue: '<mime-type>',
  }),
  file: Flags.string({
    description: 'Path to the local file to upload',
    helpValue: '<path>',
    required: true,
  }),
  filename: Flags.string({
    description: 'Original filename stored on the asset document. Defaults to the local filename',
    helpValue: '<filename>',
  }),
  type: Flags.custom<AssetType>({
    default: 'image',
    description: 'Asset type to create',
    options: ['image', 'file'],
  })(),
} satisfies FlagInput

export class UploadAssetCommand extends SanityCommand<typeof UploadAssetCommand> {
  static override description =
    'Upload one local image or file to a Sanity dataset and print the asset document as JSON'

  static override examples = [
    {
      command:
        '<%= config.bin %> <%= command.id %> --file ./hero.png --type image --dataset production',
      description: 'Upload an image using the configured project',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> --file ./brief.pdf --type file --content-type application/pdf --project-id abc123 --dataset production',
      description: 'Upload a file with explicit project, dataset, and MIME type',
    },
  ]

  static override flags = flags

  static override hiddenAliases: string[] = ['asset:upload']

  static telemetry = defineCommandTelemetry(flags, {
    redact: ['file', 'filename'],
  })

  public async run(): Promise<void> {
    const {flags} = await this.parse(UploadAssetCommand)
    const filePath = resolve(flags.file)

    const cliConfig = await this.tryGetCliConfig()
    const projectId = await this.getProjectId({fallback: () => promptForProject({})})
    const dataset = flags.dataset ?? cliConfig.api?.dataset
    if (!dataset) {
      this.error(
        'Asset upload failed: Dataset is required. Pass --dataset <name> or configure a dataset in sanity.cli.ts.',
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    try {
      const asset = await uploadAssetWithProgress({
        assetType: flags.type,
        contentType: flags['content-type'],
        dataset,
        filename: flags.filename ?? basename(filePath),
        filePath,
        isInteractive: this.resolveIsInteractive(),
        logToStderr: (message) => this.logToStderr(message),
        projectId,
      })
      const fieldType = flags.type === 'image' ? 'image' : 'file'

      this.log(
        JSON.stringify(
          {
            asset: {
              _id: asset._id,
              _type: asset._type,
              extension: asset.extension,
              mimeType: asset.mimeType,
              originalFilename: asset.originalFilename,
              size: asset.size,
              url: asset.url,
            },
            reference: {
              _type: fieldType,
              asset: {_ref: asset._id, _type: 'reference'},
            },
          },
          null,
          2,
        ),
      )
    } catch (error) {
      if (error instanceof Error && error.message === 'SIGINT') throw error
      if (error instanceof AssetFileError) {
        if (error.reason === 'not-file') {
          this.error('Asset upload failed: --file must point to a file, not a directory.', {
            exit: exitCodes.USAGE_ERROR,
          })
        }
        this.error(
          'Asset upload failed: Cannot read the local file. Check that --file points to a readable file, then retry.',
          {exit: exitCodes.USAGE_ERROR},
        )
      }
      uploadAssetDebug('Asset upload failed', error)
      this.error(getAssetUploadErrorMessage(error), {exit: exitCodes.RUNTIME_ERROR})
    }
  }
}
