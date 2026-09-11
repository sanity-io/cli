import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, getProjectCliClient, SanityCommand} from '@sanity/cli-core'
import {requiredWhenUnattended} from '@sanity/cli-core/flags'
import {boxen, spinner} from '@sanity/cli-core/ux'
import {SanityClient} from '@sanity/client'
import {type OperatorFunction, pipe, scan, tap} from 'rxjs'

import {importer, type State} from '../../actions/media/importMedia.js'
import {importMediaDebug} from '../../actions/media/importMediaDebug.js'
import {ingestMediaAssetFromUrlWithProgress} from '../../actions/media/ingestMediaAssetFromUrlWithProgress.js'
import {promptForMediaLibrary} from '../../prompts/promptForMediaLibrary.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {getMediaLibraries} from '../../services/mediaLibraries.js'
import {getAssetUploadErrorMessage} from '../../util/assetUploadErrors.js'
import {isIngestableUrl} from '../../util/isIngestableUrl.js'
import {parseAspectFlags} from '../../util/parseAspectFlags.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'
import {defineCommandTelemetry} from '../../util/telemetry/commandTelemetry.js'

const flags = {
  ...getProjectIdFlag({
    description: 'Project ID to import media to',
    semantics: 'override',
  }),
  aspect: Flags.string({
    description:
      'Aspect value to set on the imported asset, as key=value. Repeatable. Only applies when the source is a URL - directory and archive imports read aspects from their data.ndjson',
    helpValue: '<key=value>',
    multiple: true,
  }),
  filename: Flags.string({
    description:
      'Original filename to store on the asset. Only applies when the source is a URL. Defaults to a name derived from the URL',
    helpValue: '<filename>',
  }),
  'media-library-id': requiredWhenUnattended(
    Flags.string({
      description: 'The id of the target media library',
    }),
  ),
  'replace-aspects': Flags.boolean({
    description:
      'Replace existing aspect data. All versions will be replaced (e.g. published and draft aspect data). Only applies to directory and archive imports',
  }),
} satisfies FlagInput

export class MediaImportCommand extends SanityCommand<typeof MediaImportCommand> {
  static override args = {
    source: Args.string({
      description:
        'Directory, archive, or asset URL to import from. An http(s) URL imports one asset that Sanity fetches itself',
      required: true,
    }),
  }

  static override description = 'Import a set of assets to the target media library.'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> products',
      description: 'Import all assets from the "products" directory',
    },
    {
      command: '<%= config.bin %> <%= command.id %> gallery.tar.gz',
      description: 'Import all assets from "gallery" archive',
    },
    {
      command: '<%= config.bin %> <%= command.id %> products --replace-aspects',
      description: 'Import all assets from the "products" directory and replace aspects',
    },
    {
      command: '<%= config.bin %> <%= command.id %> https://example.com/hero.png',
      description: 'Have Sanity fetch a single asset from a public URL',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> https://example.com/hero.png --aspect department=Brand',
      description: 'Fetch an asset from a URL and set aspect data on it',
    },
  ]

  static override flags = flags

  static telemetry = defineCommandTelemetry(flags, {
    redact: ['aspect', 'filename'],
  })

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(MediaImportCommand)
    const {source} = args
    const replaceAspects = flags['replace-aspects']
    const isUrlSource = isIngestableUrl(source)

    const aspects = this.resolveAspects({aspectFlags: flags.aspect, isUrlSource})

    if (!isUrlSource && flags.filename !== undefined) {
      this.error(
        'The --filename flag only applies when importing from a URL. Directory and archive imports keep each asset\u2019s own filename.',
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    if (isUrlSource && replaceAspects) {
      this.error(
        'The --replace-aspects flag only applies to directory and archive imports. Aspects passed with --aspect are set when the asset is created.',
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    const projectId = await this.getProjectId({fallback: () => promptForProject({})})

    const cliConfig = await this.tryGetCliConfig()
    const dataset = cliConfig.api?.dataset

    let mediaLibraries
    try {
      mediaLibraries = await getMediaLibraries(projectId)
    } catch (error) {
      importMediaDebug('Error listing media libraries', error)
      this.error(
        `Failed to list media libraries:\n${error instanceof Error ? error.message : error}`,
        {
          exit: exitCodes.RUNTIME_ERROR,
        },
      )
    }

    if (mediaLibraries.length === 0) {
      this.error('No active media libraries found in this project', {exit: exitCodes.RUNTIME_ERROR})
    }

    let mediaLibraryId = flags['media-library-id']
    if (!mediaLibraryId) {
      try {
        mediaLibraryId = await promptForMediaLibrary({mediaLibraries})
      } catch (error) {
        importMediaDebug('Error selecting media library', error)
        this.error(
          `Failed to select media library:\n${error instanceof Error ? error.message : error}`,
          {
            exit: exitCodes.RUNTIME_ERROR,
          },
        )
      }
    }

    if (!mediaLibraries.some((library) => library.id === mediaLibraryId)) {
      this.error(`Media library with id "${mediaLibraryId}" not found`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (isUrlSource) {
      await this.importFromUrl({
        ...(aspects ? {aspects} : {}),
        ...(flags.filename ? {filename: flags.filename} : {}),
        mediaLibraryId,
        url: source,
      })
      return
    }

    const projectClient = await getProjectCliClient({
      apiVersion: 'v2025-02-19',
      dataset,
      perspective: 'drafts',
      projectId,
      requestTagPrefix: 'sanity.mediaLibraryCli.import',
      requireUser: true,
      '~experimental_resource': {
        id: mediaLibraryId,
        type: 'media-library',
      },
    })

    this.log(
      boxen(
        `
          Importing to media library: ${mediaLibraryId.padEnd(37)}
          Importing from path: ${source}
        `,
        {
          borderColor: 'yellow',
          borderStyle: 'round',
        },
      ),
    )

    const spin = spinner('Beginning import…').start()

    // ingest assets from url with progress --from-url

    // if not ingest do this
    await this.importAssets({projectClient, replaceAspects, source, spin})
  }

  private async importAssets(options: {
    projectClient: SanityClient
    replaceAspects: boolean
    source: string
    spin: ReturnType<typeof spinner>
  }): Promise<void> {
    const {projectClient, replaceAspects, source, spin} = options

    return new Promise<void>((resolve, reject) => {
      const subscription = importer({
        client: projectClient,
        replaceAspects,
        sourcePath: source,
        spinner: spin,
      })
        .pipe(this.reportResult(spin))
        .subscribe({
          complete: () => {
            resolve()
          },
          error: (error: unknown) => {
            const message = error instanceof Error ? error.message : String(error)
            spin.stop()
            reject(new Error(message))
          },
        })

      // Cleanup on Ctrl+C
      process.once('SIGINT', () => {
        subscription.unsubscribe()
        spin.fail('Import interrupted.')
        process.exit(exitCodes.SIGINT)
      })
    }).catch((error) => {
      this.error(styleText('red', error.message), {exit: exitCodes.RUNTIME_ERROR})
    })
  }

  /**
   * Import one asset that Sanity fetches from a URL itself.
   *
   * Nothing but the resulting documents goes to stdout, so the output stays
   * consumable as JSON; the wait is reported on stderr by the spinner.
   */
  private async importFromUrl(options: {
    aspects?: Record<string, string>
    filename?: string

    mediaLibraryId: string
    url: string
  }): Promise<void> {
    const {aspects, filename, mediaLibraryId, url} = options

    let result
    try {
      result = await ingestMediaAssetFromUrlWithProgress({
        ...(aspects ? {aspects} : {}),
        ...(filename ? {filename} : {}),
        isInteractive: this.resolveIsInteractive(),
        logToStderr: (message) => this.logToStderr(message),
        mediaLibraryId,
        url,
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'SIGINT') throw error
      importMediaDebug('Error importing asset from URL', error)
      this.error(getAssetUploadErrorMessage(error, {fromUrl: true, target: 'media-library'}), {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    this.log(
      JSON.stringify(
        {
          asset: {
            _id: result.asset._id,
            _type: result.asset._type,
            assetType: result.asset.assetType,
          },
          assetInstance: {
            _id: result.assetInstance._id,
            extension: result.assetInstance.extension,
            mimeType: result.assetInstance.mimeType,
            originalFilename: result.assetInstance.originalFilename,
            size: result.assetInstance.size,
            url: result.assetInstance.url,
          },
        },
        null,
        2,
      ),
    )
  }

  private reportResult(
    spin: ReturnType<typeof spinner>,
  ): OperatorFunction<State, [number, State | undefined]> {
    let previousState: State | undefined

    return pipe(
      scan<State, [number, State | undefined]>(
        (processedAssetsCount, state) => [processedAssetsCount[0] + 1, state],
        [0, undefined],
      ),
      tap({
        complete: () => spin.succeed(`Imported ${previousState?.fileCount} assets`),
        next: ([processedAssetsCount, state]) => {
          previousState = state
          spin.text = `${processedAssetsCount} of ${state?.fileCount} assets imported ${styleText('dim', state?.asset.originalFilename ?? '')}`
        },
      }),
    )
  }

  /**
   * Validate `--aspect` against the source kind and shape it for the request.
   * Runs before any network call so a malformed flag fails immediately.
   */
  private resolveAspects(options: {
    aspectFlags?: string[]

    isUrlSource: boolean
  }): Record<string, string> | undefined {
    const {aspectFlags, isUrlSource} = options
    if (!aspectFlags?.length) return undefined

    if (!isUrlSource) {
      this.error(
        'The --aspect flag only applies when importing from a URL. Directory and archive imports read aspect data from their data.ndjson file.',
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    const parsed = parseAspectFlags(aspectFlags)
    if ('error' in parsed) {
      this.error(parsed.error, {exit: exitCodes.USAGE_ERROR})
    }

    return parsed.aspects
  }
}
