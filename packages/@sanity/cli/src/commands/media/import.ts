import {Args, Flags} from '@oclif/core'
import {getProjectCliClient, SanityCommand} from '@sanity/cli-core'
import {chalk, spinner} from '@sanity/cli-core/ux'
import {SanityClient} from '@sanity/client'
import boxen from 'boxen'
import {type OperatorFunction, pipe, scan, tap} from 'rxjs'

import {importer, type State} from '../../actions/media/importMedia.js'
import {importMediaDebug} from '../../actions/media/importMediaDebug.js'
import {promptForMediaLibrary} from '../../prompts/promptForMediaLibrary.js'
import {getMediaLibraries} from '../../services/mediaLibraries.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

export class MediaImportCommand extends SanityCommand<typeof MediaImportCommand> {
  static override args = {
    source: Args.string({
      description: 'Image file or folder to import from',
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
  ]

  static override flags = {
    'media-library-id': Flags.string({
      description: 'The id of the target media library',
    }),
    'replace-aspects': Flags.boolean({
      description:
        'Replace existing aspect data. All versions will be replaced (e.g. published and draft aspect data)',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(MediaImportCommand)
    const {source} = args
    const replaceAspects = flags['replace-aspects']

    const projectId = await this.getProjectId()
    const cliConfig = await this.getCliConfig()
    const dataset = cliConfig.api?.dataset

    if (!projectId) {
      this.error(NO_PROJECT_ID, {
        exit: 1,
      })
    }

    let mediaLibraries
    try {
      mediaLibraries = await getMediaLibraries(projectId)
    } catch (error) {
      importMediaDebug('Error listing media libraries', error)
      this.error(
        `Failed to list media libraries:\n${error instanceof Error ? error.message : error}`,
        {
          exit: 1,
        },
      )
    }

    if (mediaLibraries.length === 0) {
      this.error('No active media libraries found in this project', {exit: 1})
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
            exit: 1,
          },
        )
      }
    }

    if (!mediaLibraries.some((library) => library.id === mediaLibraryId)) {
      this.error(`Media library with id "${mediaLibraryId}" not found`, {exit: 1})
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
        process.exit(130)
      })
    }).catch((error) => {
      this.error(chalk.red(error.message), {exit: 1})
    })
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
          spin.text = `${processedAssetsCount} of ${state?.fileCount} assets imported ${chalk.dim(state?.asset.originalFilename)}`
        },
      }),
    )
  }
}
