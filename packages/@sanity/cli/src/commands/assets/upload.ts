import {basename, resolve} from 'node:path'

import {Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getCliExecutionContext} from '@sanity/cli-core/executionContext'
import {spinner} from '@sanity/cli-core/ux'

import {AssetFileError} from '../../actions/assets/assetFileError.js'
import {uploadAssetFromFile} from '../../actions/assets/uploadAssetFromFile.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {type AssetType} from '../../services/assets.js'
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

    const uploadMessage = `Uploading ${flags.type} asset`
    const assetDocumentMessage = `Creating ${flags.type} asset document`
    const executionContext = getCliExecutionContext()
    const isTTY = !executionContext && Boolean(process.stderr.isTTY)
    const uploadProgress = spinner(
      isTTY
        ? `${uploadMessage} [0%]. Large uploads may take several minutes.`
        : `${uploadMessage}. Large uploads may take several minutes.`,
    ).start()
    if (executionContext) {
      this.logToStderr(`${uploadMessage}. Large uploads may take several minutes.`)
    }
    let assetDocumentProgress: ReturnType<typeof spinner> | undefined
    let assetDocumentStarted = false
    const uploadController = new AbortController()
    const interruptUpload = () => {
      uploadController.abort(new Error('SIGINT'))
      const activeProgress = assetDocumentProgress ?? uploadProgress
      activeProgress.stop()
      this.logToStderr('\u{203A} Aborted by user')
      process.exit(exitCodes.SIGINT)
    }
    const interruptOnInput = (input: Buffer | string) => {
      if (Buffer.from(input).includes(3)) interruptUpload()
    }
    const handlesInterrupt = !executionContext
    const readsInterruptInput = handlesInterrupt && process.stdin.isTTY
    if (handlesInterrupt) {
      process.once('SIGINT', interruptUpload)
      if (readsInterruptInput) {
        process.stdin.on('data', interruptOnInput)
        process.stdin.resume()
      }
    }

    const startAssetDocument = () => {
      if (assetDocumentStarted) return
      assetDocumentStarted = true
      if (!isTTY) {
        uploadProgress.text = assetDocumentMessage
        this.logToStderr(assetDocumentMessage)
        return
      }

      uploadProgress.succeed(`${uploadMessage} [100%]`)
      assetDocumentProgress = spinner(assetDocumentMessage).start()
    }

    try {
      let lastReportedProgress = 0
      let nextNonInteractiveCheckpoint = 25

      const asset = await uploadAssetFromFile({
        assetType: flags.type,
        contentType: flags['content-type'],
        dataset,
        filename: flags.filename ?? basename(filePath),
        filePath,
        onProgress: (percent) => {
          const progress = Math.min(100, Math.floor(percent))
          if (progress <= lastReportedProgress) return

          lastReportedProgress = progress
          if (progress === 100) {
            startAssetDocument()
          } else {
            uploadProgress.text = `${uploadMessage} [${progress}%]`
            if (!isTTY && progress >= nextNonInteractiveCheckpoint) {
              const checkpoint = Math.min(75, Math.floor(progress / 25) * 25)
              this.logToStderr(`${uploadMessage} [${checkpoint}%]`)
              nextNonInteractiveCheckpoint = checkpoint + 25
            }
          }
        },
        projectId,
        signal: uploadController.signal,
      })
      const fieldType = flags.type === 'image' ? 'image' : 'file'

      if (isTTY) {
        startAssetDocument()
        assetDocumentProgress?.succeed(assetDocumentMessage)
        spinner().succeed(`Uploaded ${flags.type} asset: ${asset._id}`)
      } else if (executionContext) {
        this.logToStderr(`Uploaded ${flags.type} asset: ${asset._id}`)
      } else {
        uploadProgress.succeed(`Uploaded ${flags.type} asset: ${asset._id}`)
      }
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
      const activeProgress = assetDocumentProgress ?? uploadProgress
      activeProgress.stop()
      if (uploadController.signal.aborted) {
        throw uploadController.signal.reason instanceof Error
          ? uploadController.signal.reason
          : new Error('SIGINT')
      }
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
        'Asset upload failed. Check authentication, write access, and that the local file is still readable, then retry.',
        {
          exit: exitCodes.RUNTIME_ERROR,
        },
      )
    } finally {
      if (handlesInterrupt) {
        process.off('SIGINT', interruptUpload)
        if (readsInterruptInput) {
          process.stdin.off('data', interruptOnInput)
          process.stdin.pause()
        }
      }
    }
  }
}
