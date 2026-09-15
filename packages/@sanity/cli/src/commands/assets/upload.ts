import {basename, resolve} from 'node:path'

import {Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'

import {AssetFileError} from '../../actions/assets/assetFileError.js'
import {ingestAssetFromUrlWithProgress} from '../../actions/assets/ingestAssetFromUrlWithProgress.js'
import {uploadAssetWithProgress} from '../../actions/assets/uploadAssetWithProgress.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {type AssetType} from '../../services/assets.js'
import {getAssetFilenameError, getIngestUrlError} from '../../util/assetSourceValidation.js'
import {getAssetUploadErrorMessage} from '../../util/assetUploadErrors.js'
import {getDatasetFlag, getProjectIdFlag} from '../../util/sharedFlags.js'
import {defineCommandTelemetry} from '../../util/telemetry/commandTelemetry.js'

const uploadAssetDebug = subdebug('assets:upload')

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
        'Asset upload failed: --content-type cannot be combined with --from-url. Sanity derives the MIME type automatically.',
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    const sourceUrlError = sourceUrl === undefined ? undefined : getIngestUrlError(sourceUrl)
    if (sourceUrlError) {
      this.error(`Asset upload failed: ${sourceUrlError}`, {exit: exitCodes.USAGE_ERROR})
    }

    const filenameError =
      flags.filename === undefined ? undefined : getAssetFilenameError(flags.filename)
    if (filenameError) {
      this.error(`Asset upload failed: ${filenameError}`, {exit: exitCodes.USAGE_ERROR})
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
      this.error(
        getAssetUploadErrorMessage(error, {
          fromUrl: sourceUrl !== undefined,
          target: 'dataset',
        }),
        {exit: exitCodes.RUNTIME_ERROR},
      )
    }
  }
}
