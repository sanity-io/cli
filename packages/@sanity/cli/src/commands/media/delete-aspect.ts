import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'

import {promptForProject} from '../../prompts/promptForProject.js'
import {selectMediaLibrary} from '../../prompts/selectMediaLibrary.js'
import {deleteAspect} from '../../services/mediaLibraries.js'
import {formatCliErrorMessages} from '../../util/formatCliErrorMessages.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

const deleteAspectDebug = subdebug('media:delete-aspect')

export class MediaDeleteAspectCommand extends SanityCommand<typeof MediaDeleteAspectCommand> {
  static override args = {
    aspectName: Args.string({
      description: 'Name of the aspect to delete',
      required: true,
    }),
  }

  static override description = 'Delete an aspect definition'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> someAspect',
      description: 'Delete the aspect named "someAspect"',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to delete media aspect from',
      semantics: 'override',
    }),
    'media-library-id': Flags.string({
      description: 'The id of the target media library',
      required: false,
    }),
    yes: Flags.boolean({
      aliases: ['y'],
      description: 'Run without prompts and confirm deletion',
      required: false,
    }),
  }

  public async run(): Promise<void> {
    const {aspectName} = this.args
    const {'media-library-id': mediaLibraryIdFlag, yes: skipConfirmation} = this.flags

    if (this.isUnattended()) {
      const errors: string[] = []

      if (!mediaLibraryIdFlag) {
        errors.push('Media library ID is required. Pass it with `--media-library-id <id>`.')
      }
      if (!skipConfirmation) {
        errors.push('Deletion requires confirmation. Pass `--yes` to delete the aspect.')
      }

      if (errors.length > 0) {
        this.error(formatCliErrorMessages(errors), {exit: 2})
      }
    }

    const projectId = await this.getProjectId({fallback: () => promptForProject({})})

    let mediaLibraryId = mediaLibraryIdFlag
    if (!mediaLibraryId) {
      mediaLibraryId = await selectMediaLibrary(projectId)
    }

    if (!skipConfirmation) {
      const confirmed = await confirm({
        default: false,
        message: `Are you absolutely sure you want to undeploy the ${aspectName} aspect from the "${mediaLibraryId}" media library?`,
      })

      if (!confirmed) {
        this.log('Operation cancelled')
        this.exit(exitCodes.USER_ABORT)
      }
    }

    try {
      const response = await deleteAspect({
        aspectName,
        mediaLibraryId,
        projectId,
      })

      if (response.results.length === 0) {
        this.warn(styleText('bold', `There's no deployed aspect with that name`))
        this.log(`  - ${aspectName}`)
        return
      }

      this.log()
      this.log(`${styleText('green', '✓')} ${styleText('bold', 'Deleted aspect')}`)
      this.log(`  - ${aspectName}`)

      // TODO: Find existing aspect definition files matching the undeployed aspect name and offer
      // to delete them.
    } catch (error) {
      const err = error as Error
      deleteAspectDebug('Failed to delete aspect', err)
      this.error(
        styleText('bold', 'Failed to delete aspect') +
          `\n  - ${aspectName}\n\n${styleText('red', err.message)}`,
        {
          exit: 1,
        },
      )
    }
  }
}
