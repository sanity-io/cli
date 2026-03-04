import fs from 'node:fs/promises'
import path from 'node:path'
import {type Writable} from 'node:stream'

import {Args, Flags} from '@oclif/core'
import {getProjectCliClient, SanityCommand, subdebug} from '@sanity/cli-core'
import {boxen, input, spinner} from '@sanity/cli-core/ux'
import {exportDataset, type ExportOptions, type ExportProgress} from '@sanity/export'
import prettyMs from 'pretty-ms'

import {promptForMediaLibrary} from '../../prompts/promptForMediaLibrary.js'
import {getMediaLibraries} from '../../services/mediaLibraries.js'
import {absolutify} from '../../util/absolutify.js'

const noop = () => null
const exportDebug = subdebug('media:export')

export class MediaExportCommand extends SanityCommand<typeof MediaExportCommand> {
  static override args = {
    destination: Args.string({
      description: 'Output destination file path',
    }),
  }

  static override description =
    'Export an archive of all file and image assets including their aspect data from the target media library. Video assets are excluded from the export.'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Export media library interactively',
    },
    {
      command: '<%= config.bin %> <%= command.id %> output.tar.gz',
      description: 'Export media library to output.tar.gz',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --media-library-id my-library-id',
      description: 'Export specific media library',
    },
  ]

  static override flags = {
    'asset-concurrency': Flags.integer({
      default: 8,
      description: 'Concurrent number of asset downloads',
    }),
    'media-library-id': Flags.string({
      description: 'The id of the target media library',
    }),
    'no-compress': Flags.boolean({
      default: false,
      description: 'Skips compressing tarball entries (still generates a gzip file)',
    }),
    overwrite: Flags.boolean({
      default: false,
      description: 'Overwrite any file with the same name',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(MediaExportCommand)
    const {destination: targetDestination} = args

    const projectId = await this.getProjectId()

    const projectClient = await getProjectCliClient({
      apiVersion: 'v2025-02-19',
      projectId,
      requireUser: true,
    })

    let mediaLibraries
    try {
      mediaLibraries = await getMediaLibraries(projectId)
    } catch (error) {
      exportDebug('Error listing media libraries', error)
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
        exportDebug('Error selecting media library', error)
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

    this.log(
      boxen(
        `Exporting from:
projectId: ${projectId.padEnd(44)}
mediaLibraryId: ${mediaLibraryId.padEnd(37)}`,
        {
          borderColor: 'yellow',
          borderStyle: 'round',
        },
      ),
    )

    let destinationPath = targetDestination
    if (!destinationPath) {
      destinationPath = await this.promptForDestination({mediaLibraryId})
    }

    const outputPath = await this.getOutputPath(destinationPath, mediaLibraryId, flags)
    if (!outputPath) {
      this.error('Cancelled', {exit: 1})
    }

    const {fail, onProgress, succeed} = this.createProgressHandler()
    const exportOptions: ExportOptions = {
      assetConcurrency: flags['asset-concurrency'],
      client: projectClient,
      compress: !flags['no-compress'],
      mediaLibraryId,
      onProgress,
      outputPath,
    }

    const start = Date.now()
    try {
      await exportDataset(exportOptions)
      succeed()
      this.log(`Export finished (${prettyMs(Date.now() - start)})`)
    } catch (error) {
      fail()
      const err = error instanceof Error ? error : new Error(String(error))
      exportDebug('Export failed', err)
      this.error(`Export failed: ${err.message}`, {exit: 1})
    }
  }

  private createProgressHandler() {
    let currentSpinner: ReturnType<typeof spinner> | null = null
    let currentStep = ''

    const onProgress = (progress: ExportProgress) => {
      if (progress.step !== currentStep) {
        succeed()

        currentStep = progress.step
        currentSpinner = spinner(progress.step).start()
      } else if (progress.step === currentStep && progress.update && currentSpinner) {
        currentSpinner.text = `${progress.step} (${progress.current}/${progress.total})`
      }
    }

    const succeed = () => {
      currentSpinner?.succeed()
    }

    const fail = () => {
      currentSpinner?.fail()
    }

    return {fail, onProgress, succeed}
  }

  private async getOutputPath(
    destination: string,
    mediaLibraryId: string,
    flags: {overwrite?: boolean},
  ): Promise<string | Writable> {
    if (destination === '-') {
      return process.stdout
    }

    const dstPath = path.isAbsolute(destination)
      ? destination
      : path.resolve(process.cwd(), destination)

    const dstStats = await fs.stat(dstPath).catch(noop)
    const looksLikeFile = dstStats ? dstStats.isFile() : path.basename(dstPath).includes('.')

    if (!dstStats) {
      const createPath = looksLikeFile ? path.dirname(dstPath) : dstPath
      try {
        await fs.mkdir(createPath, {recursive: true})
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        this.error(`Failed to create directory "${createPath}": ${err.message}`, {
          exit: 1,
        })
      }
    }

    const finalPath = looksLikeFile
      ? dstPath
      : path.join(dstPath, `${mediaLibraryId}-export.tar.gz`)
    const finalPathStats = await fs.stat(finalPath).catch(noop)

    if (!flags.overwrite && finalPathStats && finalPathStats.isFile()) {
      this.error(`File "${finalPath}" already exists. Use --overwrite flag to overwrite it.`, {
        exit: 1,
      })
    }

    return finalPath
  }

  private promptForDestination(options: {
    mediaLibraryId: string
    workDir?: string
  }): Promise<string> {
    const {mediaLibraryId, workDir = process.cwd()} = options

    const defaultPath = path.join(workDir, `${mediaLibraryId}-export.tar.gz`)

    return input({
      default: defaultPath,
      message: 'Output path:',
      transformer: (value: string) => absolutify(value.trim()),
      validate: (value: string) => {
        const trimmed = value.trim()
        if (!trimmed) {
          return 'Please provide a valid output path'
        }
        return true
      },
    })
  }
}
