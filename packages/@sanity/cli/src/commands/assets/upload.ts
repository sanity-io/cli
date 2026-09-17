import {basename, resolve} from 'node:path'

import {Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {AssetFileError} from '../../actions/assets/assetFileError.js'
import {BatchInputError} from '../../actions/assets/batchManifest.js'
import {uploadAssetBatch} from '../../actions/assets/uploadAssetBatch.js'
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
  return `${response}\n\nTry again.`
}

const flags = {
  ...getProjectIdFlag({
    description: 'Project ID to upload the asset to',
    semantics: 'override',
  }),
  ...getDatasetFlag({description: 'Dataset to upload the asset to', semantics: 'override'}),
  concurrency: Flags.integer({
    dependsOn: ['manifest'],
    description: 'Maximum concurrent batch uploads (default: 4)',
    min: 1,
  }),
  'content-type': Flags.string({
    description: 'MIME type of the asset, such as image/png or application/pdf',
    helpValue: '<mime-type>',
  }),
  'dry-run': Flags.boolean({
    dependsOn: ['manifest'],
    description: 'Validate entries without uploading assets',
  }),
  'fail-fast': Flags.boolean({
    dependsOn: ['manifest'],
    description: 'Stop starting entries after the first failure',
  }),
  file: Flags.string({
    description: 'Path to the local file to upload',
    exactlyOne: ['file', 'manifest'],
    helpValue: '<path>',
  }),
  filename: Flags.string({
    description: 'Original filename stored on the asset document. Defaults to the local filename',
    helpValue: '<filename>',
  }),
  manifest: Flags.string({
    description: 'Path to a version 1 asset manifest',
    exclusive: ['file', 'filename', 'content-type', 'type'],
  }),
  output: Flags.string({
    dependsOn: ['manifest'],
    description: 'Batch result format',
    options: ['jsonl'],
  }),
  resume: Flags.boolean({
    dependsOn: ['manifest'],
    description: 'Save progress and skip completed entries on rerun',
  }),
  state: Flags.string({
    dependsOn: ['manifest', 'resume'],
    description: 'Resume state path. Defaults to <manifest>.state.json',
  }),
  type: Flags.custom<AssetType>({
    default: 'image',
    description: 'Asset type to create',
    options: ['image', 'file'],
  })(),
} satisfies FlagInput

export class UploadAssetCommand extends SanityCommand<typeof UploadAssetCommand> {
  static override description = `Upload a local asset or a manifest of local files to a Sanity dataset

A manifest is a JSON object with version: 1 and an assets array. Each entry needs a unique key and a source (local file path). Optional fields: type (image or file, default image), filename, and contentType. Local paths are relative to the manifest directory.

Example manifest: {"version":1,"assets":[{"key":"hero","source":"./hero.png"},{"key":"brief","source":"./brief.pdf","type":"file"}]}

With --output jsonl, each entry produces one result: uploaded, skipped, validated, failed, or not-started. Uploaded and skipped results include the asset and a complete reference. Results can arrive in any order; use key to match them to entries.

--resume saves completed entries to <manifest>.state.json. Changed local contents, upload options, or destinations are uploaded again. Do not share one state file between simultaneous runs.

--dry-run checks entry fields and local files without uploading or writing state. --fail-fast lets active uploads finish and reports remaining entries as not-started. Documents are never changed.`

  static override examples = [
    {
      command:
        '<%= config.bin %> <%= command.id %> --manifest ./assets.json --output jsonl --resume',
      description: 'Upload a batch and save progress for retries',
    },
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
    redact: ['file', 'filename', 'manifest', 'state', 'content-type'],
  })

  public async run(): Promise<void> {
    const {flags} = await this.parse(UploadAssetCommand)

    const cliConfig = await this.tryGetCliConfig()
    const projectId = await this.getProjectId({
      fallback: () => {
        if (flags.manifest && (flags.output === 'jsonl' || flags['dry-run'])) {
          this.output.error(
            'Project ID is required. Pass --project-id <id> or configure a project in sanity.cli.ts.',
          )
        }
        return promptForProject({})
      },
    })
    const dataset = flags.dataset ?? cliConfig.api?.dataset
    if (!dataset) {
      this.error(
        'Asset upload failed: Dataset is required. Pass --dataset <name> or configure a dataset in sanity.cli.ts.',
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    if (flags.manifest) {
      const controller = new AbortController()
      const interrupt = () => controller.abort(new Error('SIGINT'))
      process.once('SIGINT', interrupt)
      let success: boolean
      try {
        success = await uploadAssetBatch({
          concurrency: flags.concurrency,
          dataset,
          dryRun: flags['dry-run'],
          failFast: flags['fail-fast'],
          manifestPath: flags.manifest,
          onResult: (result) =>
            this.output.log(
              flags.output === 'jsonl'
                ? JSON.stringify(result)
                : `${result.key}: ${result.status}${'error' in result && result.error ? ` — ${result.error.message}` : ''}`,
            ),
          projectId,
          resume: flags.resume,
          signal: controller.signal,
          statePath: flags.state,
        })
      } catch (error) {
        controller.signal.throwIfAborted()
        this.output.error(getErrorMessage(error), {
          exit: error instanceof BatchInputError ? exitCodes.USAGE_ERROR : exitCodes.RUNTIME_ERROR,
        })
      } finally {
        process.off('SIGINT', interrupt)
      }
      if (!success) this.exit(exitCodes.RUNTIME_ERROR)
      return
    }

    const filePath = resolve(flags.file!)
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
