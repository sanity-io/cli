import {basename, resolve} from 'node:path'

import {Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {AssetFileError} from '../../actions/assets/assetFileError.js'
import {ingestAssetFromUrlWithProgress} from '../../actions/assets/ingestAssetFromUrlWithProgress.js'
import {uploadAssetWithProgress} from '../../actions/assets/uploadAssetWithProgress.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {type AssetType} from '../../services/assets.js'
import {getDatasetFlag, getProjectIdFlag} from '../../util/sharedFlags.js'
import {defineCommandTelemetry} from '../../util/telemetry/commandTelemetry.js'

const uploadAssetDebug = subdebug('assets:upload')
const DATASET_ASSET_LIMITS_URL =
  'https://www.sanity.io/docs/content-lake/technical-limits#k2c53dc30e24b'

function isProjectUserNotFoundError(body: Record<string, unknown>): boolean {
  const responseError = body.error
  return (
    typeof responseError === 'object' &&
    responseError !== null &&
    'type' in responseError &&
    responseError.type === 'projectUserNotFoundError'
  )
}

function getAssetUploadErrorMessage(error: unknown, options: {fromUrl: boolean}): string {
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
  const projectUserNotFound = isProjectUserNotFoundError(body)
  const responseMessage = projectUserNotFound ? error.message : getErrorMessage(error)
  const message = /[.!?]$/.test(responseMessage) ? responseMessage : `${responseMessage}.`
  const details = typeof body.details === 'string' ? `\n\nDetails:\n${body.details}` : ''
  const response = `Asset upload failed: HTTP ${statusCode} - ${responseError}\n${message}${details}`

  if (error.statusCode === 401 && !projectUserNotFound) {
    return `${response}\n\nRun \`sanity login\` to authenticate, then try again.`
  }
  if (error.statusCode === 403) {
    return `${response}\n\nCheck that your account has write access to this dataset, then try again.`
  }
  if ([400, 413, 422].includes(error.statusCode)) {
    return `${response}\n\nCheck the asset requirements and current technical limits, then try again: ${DATASET_ASSET_LIMITS_URL}`
  }
  // Only meaningful for URL ingestion, where the gateway failure describes
  // Sanity's own fetch of the source rather than the request made here.
  if (options.fromUrl && [502, 504].includes(error.statusCode)) {
    return `${response}\n\nSanity could not fetch the source URL. Check that it is reachable from the public internet without authentication and serves the asset directly, then try again.`
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
    description:
      'MIME type of the asset, such as image/png or application/pdf. Only applies to --file',
    helpValue: '<mime-type>',
  }),
  file: Flags.string({
    description: 'Path to the local file to upload',
    exactlyOne: ['file', 'from-url'],
    helpValue: '<path>',
  }),
  filename: Flags.string({
    description:
      'Original filename stored on the asset document. Defaults to the local filename when using --file',
    helpValue: '<filename>',
  }),
  'from-url': Flags.string({
    description:
      'URL for Sanity to fetch the asset from, instead of uploading a local file. Must be reachable from the public internet without authentication',
    exactlyOne: ['file', 'from-url'],
    helpValue: '<url>',
  }),
  type: Flags.custom<AssetType>({
    default: 'image',
    description: 'Asset type to create',
    options: ['image', 'file'],
  })(),
} satisfies FlagInput

export class UploadAssetCommand extends SanityCommand<typeof UploadAssetCommand> {
  static override description =
    'Upload one image or file to a Sanity dataset, from a local path or a URL, and print the asset document as JSON'

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
    {
      command:
        '<%= config.bin %> <%= command.id %> --from-url https://example.com/hero.png --type image --dataset production',
      description: 'Have Sanity fetch an image from a public URL',
    },
  ]

  static override flags = flags

  static override hiddenAliases: string[] = ['asset:upload']

  static telemetry = defineCommandTelemetry(flags, {
    redact: ['file', 'filename', 'from-url'],
  })

  public async run(): Promise<void> {
    const {flags} = await this.parse(UploadAssetCommand)
    const sourceUrl = flags['from-url']

    if (sourceUrl && flags['content-type']) {
      this.error(
        'Asset upload failed: --content-type cannot be combined with --from-url. Sanity derives the MIME type from the fetched response.',
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    const cliConfig = await this.tryGetCliConfig()
    const projectId = await this.getProjectId({fallback: () => promptForProject({})})
    const dataset = flags.dataset ?? cliConfig.api?.dataset
    if (!dataset) {
      this.error(
        'Asset upload failed: Dataset is required. Pass --dataset <name> or configure a dataset in sanity.cli.ts.',
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    const isInteractive = this.resolveIsInteractive()

    try {
      let asset
      if (sourceUrl === undefined) {
        // `exactlyOne` on the flags guarantees a source, but not to the compiler.
        if (flags.file === undefined) {
          this.error('Asset upload failed: Pass either --file <path> or --from-url <url>.', {
            exit: exitCodes.USAGE_ERROR,
          })
        }
        const filePath = resolve(flags.file)
        asset = await uploadAssetWithProgress({
          assetType: flags.type,
          contentType: flags['content-type'],
          dataset,
          filename: flags.filename ?? basename(filePath),
          filePath,
          isInteractive,
          logToStderr: (message) => this.logToStderr(message),
          projectId,
        })
      } else {
        asset = await ingestAssetFromUrlWithProgress({
          assetType: flags.type,
          dataset,
          // Left undefined so Content Lake names the asset from the fetched
          // response rather than from the URL path, which often carries none.
          filename: flags.filename,
          isInteractive,
          logToStderr: (message) => this.logToStderr(message),
          projectId,
          url: sourceUrl,
        })
      }
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
      this.error(getAssetUploadErrorMessage(error, {fromUrl: sourceUrl !== undefined}), {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
