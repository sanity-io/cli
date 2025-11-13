// import {input} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import {SanityCommand, spinner, subdebug} from '@sanity/cli-core'
import boxen from 'boxen'

import {promptForMediaLibrary} from '../../prompts/promptForMediaLibrary.js'
import {getMediaLibraries} from '../../services/mediaLibraries.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const importDebug = subdebug('media:import')

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

    const projectId = await this.getProjectId()

    if (!projectId) {
      this.error(NO_PROJECT_ID, {
        exit: 1,
      })
    }

    // const projectClient = await this.getProjectApiClient({
    //   apiVersion: 'v2025-02-19',
    //   projectId,
    //   requireUser: true,
    // })

    let mediaLibraries
    try {
      mediaLibraries = await getMediaLibraries(projectId)
    } catch (error) {
      importDebug('Error listing media libraries', error)
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
        importDebug('Error selecting media library', error)
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

    spinner('Beginning import…').start()
  }
}
